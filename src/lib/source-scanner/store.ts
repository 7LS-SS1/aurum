import { randomUUID } from "node:crypto";
import type { Prisma, VideoSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Actor } from "@/lib/authz";
import { ApiError } from "@/lib/api-response";
import { allowedUrl, ScannerError, SourceInput } from "./contracts";
import { validateRecipe } from "./adapters";

export const STALE_MS = 30 * 60_000;
export async function hostBackoffPolicy() {
  const rows = await prisma.scannerLease.findMany({ where: { id: { startsWith: "host:" }, expiresAt: { gt: new Date() } } });
  return { backoffs: new Map(rows.map((row) => [row.id.slice(5), row.expiresAt])),
    onRateLimit: async (host: string, until: Date) => {
      await prisma.scannerLease.upsert({ where: { id: `host:${host}` }, create: { id: `host:${host}`, token: "cooldown", expiresAt: until }, update: { expiresAt: until } });
    },
  };
}
export async function withScannerLease<T>(work: (token: string) => Promise<T>): Promise<T> {
  const token = randomUUID();
  await prisma.scannerLease.upsert({ where: { id: "global" }, create: { id: "global", token: "", expiresAt: new Date(0) }, update: {} });
  const acquired = await prisma.scannerLease.updateMany({ where: { id: "global", expiresAt: { lte: new Date() } }, data: { token, expiresAt: new Date(Date.now() + STALE_MS) } });
  if (!acquired.count) throw new ScannerError("BUSY", 409);
  try { return await work(token); }
  finally { await prisma.scannerLease.updateMany({ where: { id: "global", token }, data: { expiresAt: new Date(0) } }); }
}
export async function event(tx: Prisma.TransactionClient, sourceId: string, code: string, message: string, itemId?: string) {
  await tx.sourceEvent.create({ data: { sourceId, code, message, itemId } });
  const cutoff = await tx.sourceEvent.findMany({ where: { sourceId }, orderBy: [{ at: "desc" }, { id: "desc" }], skip: 1000, select: { id: true } });
  if (cutoff.length) await tx.sourceEvent.deleteMany({ where: { id: { in: cutoff.map((e) => e.id) } } });
}
export async function getSource(id: string) {
  const source = await prisma.videoSource.findFirst({ where: { id, deletedAt: null } });
  if (!source) throw new ApiError("ไม่พบแหล่งวิดีโอ", 404);
  return source;
}
export async function saveSource(input: SourceInput, actor: Actor, id?: string) {
  if (!actor.id) throw new ApiError("unauthorized", 401);
  const recipe = validateRecipe(input.adapter, input.recipe);
  const data = { ...input, baseUrl: allowedUrl(input.baseUrl, input.allowedHosts), recipe: (input.adapter === "AUTO" || !input.recipe ? {} : recipe) as Prisma.InputJsonValue, maxFileBytes: BigInt(input.maxFileBytes) };
  return prisma.$transaction(async (tx) => {
    let source: VideoSource;
    if (id) {
      const changed = await tx.videoSource.updateMany({ where: { id, control: "STOP", deletedAt: null }, data: { ...data, recipeVersion: { increment: 1 }, stopVersion: { increment: 1 }, scanComplete: false, nextScanAt: new Date() } });
      if (!changed.count) throw new ApiError("ต้องหยุดแหล่งก่อนแก้ไข", 409);
      // New recipe starts traversal from the beginning; discovered items remain deduplicated.
      await tx.sourcePage.deleteMany({ where: { sourceId: id } });
      source = await tx.videoSource.findUniqueOrThrow({ where: { id } });
    } else source = await tx.videoSource.create({ data });
    await tx.auditLog.create({ data: { actorId: actor.id, actorRole: actor.role, action: id ? "source_update" : "source_create", resourceType: "video_source", resourceId: source.id, metadata: { recipeVersion: source.recipeVersion } } });
    await event(tx, source.id, "CONFIGURED", "บันทึกแหล่งข้อมูลแล้ว");
    return source;
  });
}
export async function setControl(id: string, action: "RUN" | "PAUSE" | "STOP", actor: Actor, remove = false) {
  return prisma.$transaction(async (tx) => {
    const source = await tx.videoSource.findFirst({ where: { id, deletedAt: null } });
    if (!source) throw new ApiError("ไม่พบแหล่งวิดีโอ", 404);
    const updated = await tx.videoSource.updateMany({ where: { id, deletedAt: null, updatedAt: source.updatedAt }, data: {
      control: action, ...(action === "STOP" ? { stopVersion: { increment: 1 } } : {}),
      ...(action === "RUN" && (!source.scanComplete || source.scanIntervalMinutes > 0) ? { nextScanAt: new Date() } : {}), ...(remove ? { deletedAt: new Date() } : {}),
    } });
    if (!updated.count) throw new ApiError("ข้อมูลเปลี่ยนแล้ว กรุณาลองใหม่", 409);
    if (action === "RUN" && source.control === "STOP" && !source.scanComplete) {
      await tx.sourcePage.updateMany({
        where: { sourceId: id, state: "FAILED", errorCode: "PAGINATION_UNPROVEN" },
        data: { state: "PENDING", attempts: 0, terminal: false, retryAt: new Date(), error: null, errorCode: null, claimToken: null },
      });
    }
    await event(tx, id, remove ? "DELETED" : action, remove ? "หยุดและลบแหล่งออกจากรายการแล้ว" : { RUN: "เริ่มทำงาน", PAUSE: "พักการเริ่มงานใหม่", STOP: "ส่งคำสั่งหยุดงานปัจจุบัน" }[action]);
    await tx.auditLog.create({ data: { actorId: actor.id, actorRole: actor.role, action: remove ? "source_delete" : `source_${action.toLowerCase()}`, resourceType: "video_source", resourceId: id } });
    return { id, control: action };
  });
}

/** Locks the source row before saving results; STOP invalidates old workers. */
export async function fence(tx: Prisma.TransactionClient, source: VideoSource, lease: string) {
  const held = await tx.scannerLease.updateMany({ where: { id: "global", token: lease, expiresAt: { gt: new Date() } }, data: { token: lease } });
  if (!held.count) throw new ScannerError("STOPPED");
  const changed = await tx.videoSource.updateMany({ where: { id: source.id, deletedAt: null, stopVersion: source.stopVersion, control: { in: ["RUN", "PAUSE"] } }, data: { updatedAt: new Date() } });
  if (!changed.count) throw new ScannerError("STOPPED");
}
export async function recoverStale() {
  const before = new Date(Date.now() - STALE_MS);
  await prisma.sourcePage.updateMany({ where: { state: "RUNNING", updatedAt: { lt: before } }, data: { state: "PENDING", claimToken: null, retryAt: new Date() } });
  await prisma.sourceItem.updateMany({ where: { state: { in: ["RESOLVING", "DOWNLOADING"] }, updatedAt: { lt: before } }, data: { state: "PENDING", claimToken: null, retryAt: new Date(), startedAt: null } });
  // Stale recovery must not create an unbounded fourth attempt.
  await prisma.sourcePage.updateMany({ where: { state: "PENDING", attempts: { gte: 3 } }, data: { state: "FAILED" } });
  await prisma.sourceItem.updateMany({ where: { state: "PENDING", attempts: { gte: 3 } }, data: { state: "FAILED" } });
}
function startableSource(stopVersion?: number): Prisma.VideoSourceWhereInput {
  return { control: "RUN", deletedAt: null, ...(stopVersion === undefined ? {} : { stopVersion }) };
}
export async function claimPage(sourceId: string, stopVersion?: number) {
  const row = await prisma.sourcePage.findFirst({ where: { sourceId, state: "PENDING", attempts: { lt: 3 }, retryAt: { lte: new Date() } }, orderBy: { createdAt: "asc" } });
  if (!row) return null;
  const claimToken = randomUUID();
  const result = await prisma.sourcePage.updateMany({ where: { id: row.id, state: row.state, updatedAt: row.updatedAt, source: startableSource(stopVersion) }, data: { state: "RUNNING", claimToken, attempts: { increment: 1 }, error: null, errorCode: null } });
  return result.count ? { ...row, claimToken, attempts: row.attempts + 1 } : null;
}
export async function claimItem(sourceId: string, stopVersion?: number) {
  const row = await prisma.sourceItem.findFirst({ where: { sourceId, state: "PENDING", attempts: { lt: 3 }, retryAt: { lte: new Date() } }, orderBy: { createdAt: "asc" } });
  if (!row) return null;
  const claimToken = randomUUID();
  const result = await prisma.sourceItem.updateMany({ where: { id: row.id, state: row.state, updatedAt: row.updatedAt, source: startableSource(stopVersion) }, data: { state: "RESOLVING", claimToken, attempts: { increment: 1 }, startedAt: new Date(), bytes: BigInt(0), error: null, errorCode: null } });
  return result.count ? { ...row, claimToken, attempts: row.attempts + 1 } : null;
}
