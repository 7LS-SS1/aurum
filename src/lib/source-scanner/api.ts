import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMinRole } from "@/lib/authz";
import { ApiError, jsonOk } from "@/lib/api-response";
import { logAudit } from "@/lib/audit";
import { itemStateSchema, redactedUrl, scannerError, ScannerError, sourceSchema } from "./contracts";
import { readListing, resolveItem } from "./adapters";
import { networkContext } from "./network";
import { event, getSource, hostBackoffPolicy, saveSource, setControl, withScannerLease } from "./store";
import { scannerApiError } from "./api-error";

type Context = { params: Promise<{ id: string; itemId?: string }> };
function json(value: unknown, status = 200) {
  return jsonOk(JSON.parse(JSON.stringify(value, (_key, v) => typeof v === "bigint" ? Number(v) : v)), { status, headers: { "Cache-Control": "no-store" } });
}
const wrap = (handler: (req: Request, ctx: Context) => Promise<Response>) => async (req: Request, ctx: Context) => {
  try { return await handler(req, ctx); } catch (error) { return scannerApiError(error); }
};
const pagination = (req: Request) => {
  const params = new URL(req.url).searchParams;
  return z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), take: z.coerce.number().int().min(1).max(100).default(50) }).parse(Object.fromEntries(["page", "take"].filter((k) => params.has(k)).map((k) => [k, params.get(k)])));
};
export const listSources = wrap(async (req) => {
  await requireMinRole("STAFF");
  const { page, take } = pagination(req);
  const params = new URL(req.url).searchParams;
  const filter = z.enum(["all", "running", "attention", "idle"]).parse(params.get("filter") ?? "all");
  const q = z.string().trim().max(160).parse(params.get("q") ?? "");
  const visible = { deletedAt: null };
  const attention: Prisma.VideoSourceWhereInput = { OR: [
    { pages: { some: { state: "FAILED" } } }, { items: { some: { state: { in: ["FAILED", "UNSUPPORTED"] } } } },
  ] };
  const running = { control: "RUN" as const };
  const condition = filter === "running" ? running : filter === "idle" ? { NOT: running } : filter === "attention" ? attention : {};
  const search: Prisma.VideoSourceWhereInput = q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { baseUrl: { contains: q, mode: "insensitive" } }] } : {};
  const where = { ...visible, AND: [condition, search] };
  const [rows, total, sourceTotal, activeTotal, attentionTotal, itemTotals, failedPageTotal, reviewTotal, worker] = await Promise.all([
    prisma.videoSource.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * take, take }),
    prisma.videoSource.count({ where }),
    prisma.videoSource.count({ where: visible }),
    prisma.videoSource.count({ where: { ...visible, ...running } }),
    prisma.videoSource.count({ where: { ...visible, ...attention } }),
    prisma.sourceItem.groupBy({ by: ["state"], where: { source: visible }, _count: true }),
    prisma.sourcePage.count({ where: { source: visible, state: "FAILED" } }),
    prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM source_items i JOIN video_sources s ON s.id = i."sourceId" JOIN movies m ON m.id = i."movieId" WHERE s."deletedAt" IS NULL AND m.status = 'READY_FOR_REVIEW'`,
    prisma.scannerWorkerStatus.findUnique({ where: { id: "scanner" } }),
  ]);
  const ids = rows.map((row) => row.id);
  const [items, pages, reviewRows, errors] = ids.length ? await Promise.all([
    prisma.sourceItem.groupBy({ by: ["sourceId", "state"], where: { sourceId: { in: ids } }, _count: true }),
    prisma.sourcePage.groupBy({ by: ["sourceId", "state"], where: { sourceId: { in: ids } }, _count: true }),
    prisma.$queryRaw<{ sourceId: string; count: bigint }[]>(Prisma.sql`SELECT i."sourceId", COUNT(*) AS count FROM source_items i JOIN movies m ON m.id = i."movieId" WHERE i."sourceId" IN (${Prisma.join(ids)}) AND m.status = 'READY_FOR_REVIEW' GROUP BY i."sourceId"`),
    prisma.sourcePage.findMany({ where: { sourceId: { in: ids }, state: "FAILED", error: { not: null } }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], distinct: ["sourceId"], select: { sourceId: true, error: true } }),
  ]) : [[], [], [], []] as const;
  const sources = rows.map((source) => {
    const counts = Object.fromEntries(items.filter((i) => i.sourceId === source.id).map((i) => [i.state, i._count]));
    const pageRows = pages.filter((p) => p.sourceId === source.id);
    const pageCount = (state: string) => pageRows.find((p) => p.state === state)?._count ?? 0;
    return { ...source, baseUrl: redactedUrl(source.baseUrl), counts, scanning: pageCount("RUNNING") > 0,
      pageStats: { total: pageRows.reduce((n, p) => n + p._count, 0), done: pageCount("DONE"), failed: pageCount("FAILED") },
      ready: Number(reviewRows.find((row) => row.sourceId === source.id)?.count ?? 0), lastError: errors.find((row) => row.sourceId === source.id)?.error ?? null,
    };
  });
  return json({ sources, total, page, take, worker, summary: { tasks: sourceTotal, running: activeTotal, attention: attentionTotal,
    discovered: itemTotals.reduce((n, row) => n + row._count, 0), ready: Number(reviewTotal[0]?.count ?? 0),
    errors: failedPageTotal + itemTotals.filter((row) => row.state === "FAILED" || row.state === "UNSUPPORTED").reduce((n, row) => n + row._count, 0),
  } });
});
export const createSource = wrap(async (req) => {
  const actor = await requireMinRole("MANAGER");
  return json(await saveSource(sourceSchema.parse(await req.json()), actor), 201);
});
export const updateSource = wrap(async (req, ctx) => {
  const actor = await requireMinRole("MANAGER"); const { id } = await ctx.params;
  return json(await saveSource(sourceSchema.parse(await req.json()), actor, id));
});
export const deleteSource = wrap(async (_req, ctx) => {
  const actor = await requireMinRole("MANAGER"); const { id } = await ctx.params;
  return json(await setControl(id, "STOP", actor, true));
});
export const controlSource = wrap(async (req, ctx) => {
  const actor = await requireMinRole("MANAGER"); const { id } = await ctx.params;
  const { action } = z.object({ action: z.enum(["RUN", "PAUSE", "STOP"]) }).strict().parse(await req.json());
  return json(await setControl(id, action, actor));
});
export const sourceDetail = wrap(async (req, ctx) => {
  await requireMinRole("STAFF"); const { id } = await ctx.params;
  const source = await getSource(id); const { page, take } = pagination(req);
  const [pages, pageTotal, events, counts] = await Promise.all([
    prisma.sourcePage.findMany({ where: { sourceId: id }, orderBy: { createdAt: "asc" }, take, skip: (page - 1) * take }),
    prisma.sourcePage.count({ where: { sourceId: id } }),
    prisma.sourceEvent.findMany({ where: { sourceId: id }, orderBy: [{ at: "desc" }, { id: "desc" }], take: 1000 }),
    prisma.sourceItem.groupBy({ by: ["state"], where: { sourceId: id }, _count: true }),
  ]);
  return json({ source, pages: pages.map((p) => ({ ...p, claimToken: undefined, url: redactedUrl(p.url) })), pageTotal, events, counts: Object.fromEntries(counts.map((c) => [c.state, c._count])) });
});
export const sourceItems = wrap(async (req, ctx) => {
  await requireMinRole("STAFF"); const { id } = await ctx.params; await getSource(id);
  const params = new URL(req.url).searchParams; const { page, take } = pagination(req);
  const state = params.get("state") ? itemStateSchema.parse(params.get("state")) : undefined;
  const where = { sourceId: id, state };
  const [items, total] = await Promise.all([
    prisma.sourceItem.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * take, take }), prisma.sourceItem.count({ where }),
  ]);
  return json({ items: items.map((item) => ({ ...item, claimToken: undefined, pageUrl: redactedUrl(item.pageUrl), mediaUrl: item.mediaUrl ? redactedUrl(item.mediaUrl) : null, coverUrl: null })), total, page, take });
});
export const retryItem = wrap(async (_req, ctx) => {
  const actor = await requireMinRole("MANAGER"); const { id, itemId } = await ctx.params;
  await getSource(id);
  await prisma.$transaction(async (tx) => {
    const changed = await tx.sourceItem.updateMany({ where: { id: itemId, sourceId: id, state: { in: ["FAILED", "UNSUPPORTED"] }, movieId: null }, data: {
      state: "PENDING", attempts: 0, error: null, errorCode: null, bytes: null, durationSec: null, claimToken: null, retryAt: new Date(), startedAt: null, finishedAt: null,
    } });
    if (!changed.count) throw new ApiError("ลองใหม่ได้เฉพาะรายการผิดพลาดหรือไม่รองรับ", 409);
    await event(tx, id, "RETRY", "ผู้ดูแลส่งรายการเข้าคิวใหม่", itemId);
    await tx.auditLog.create({ data: { actorId: actor.id, actorRole: actor.role, action: "source_item_retry", resourceType: "source_item", resourceId: itemId, metadata: { sourceId: id } } });
  });
  return json({ ok: true });
});
export const testSource = wrap(async (req, ctx) => {
  const actor = await requireMinRole("MANAGER"); const { id } = await ctx.params;
  const raw = await req.text();
  const source = raw.trim() ? sourceSchema.parse(JSON.parse(raw)) : await getSource(id);
  const result = await withScannerLease(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new ScannerError("TIMEOUT")), 45_000);
    try {
      const fetcher = networkContext(controller.signal, undefined, await hostBackoffPolicy())(source.allowedHosts as string[], source.requestIntervalMs);
      const listing = await readListing(source.baseUrl, source, fetcher);
      let first = null; let error = null;
      if (listing.items[0]) {
        try {
          const resolved = await resolveItem(listing.items[0], source, fetcher);
          first = { title: resolved.title, mediaUrl: resolved.mediaUrl ? redactedUrl(resolved.mediaUrl) : null };
        } catch (cause) { error = scannerError(cause).message; }
      }
      return { links: listing.items.slice(0, 10).map((i) => redactedUrl(i.pageUrl)), discovered: listing.items.length, terminal: listing.terminal,
        next: listing.next ? redactedUrl(listing.next) : null, first, error: error ?? (listing.paginationError ? new ScannerError(listing.paginationError).message : null) };
    } finally { clearTimeout(timer); }
  });
  await logAudit({ actor, action: "source_recipe_test", resourceType: "video_source", resourceId: id === "draft" ? undefined : id, metadata: { discovered: result.discovered } });
  return json(result);
});
