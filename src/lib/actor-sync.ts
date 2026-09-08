import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { decrypt } from "./crypto";
import { WordPressClient, WordPressHttpError } from "./wordpress-client";
import { actorPayload, actorFingerprint } from "./actor-sync-contract";
import type { Actor } from "./authz";
import { ApiError } from "./api-response";

export function actorSyncErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message
    : error instanceof WordPressHttpError && error.status === 404 ? "ปลายทางไม่มี API นักแสดง กรุณาเปิดส่วนเชื่อมต่อ AURUM ในธีมหรือปลั๊กอินรุ่นที่รองรับ"
    : error instanceof WordPressHttpError && [401, 403].includes(error.status) ? "ปลายทางไม่อนุญาต กรุณาตรวจ Application Password และสิทธิ์ผู้ดูแล WordPress"
    : error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "ปลายทางตอบช้าเกินกำหนด กรุณาตรวจ WordPress และ Tunnel แล้วลองใหม่"
    : "ส่งไม่สำเร็จ กรุณาตรวจส่วนเชื่อมต่อ สิทธิ์ และการเชื่อมต่อปลายทาง แล้วลองใหม่";
}

export async function checkActorDestination(siteId: string): Promise<void> {
  try {
    const schema = await prisma.$queryRaw<{ ready: boolean }[]>`SELECT to_regclass('actor_syncs') IS NOT NULL AS ready`;
    if (!schema[0]?.ready) throw new ApiError("กรุณารัน migration นักแสดงก่อนเริ่มส่ง", 503);
    const site = await prisma.targetSite.findUnique({ where: { id: siteId } });
    if (!site?.isActive) throw new ApiError("เว็บไซต์ไม่พร้อมรับข้อมูลหรือถูกปิดใช้งาน", 400);
    const client = new WordPressClient({ baseUrl: site.baseUrl, authType: site.authType, username: site.wpUsername,
      credential: decrypt({ ciphertext: site.credentialEnc, iv: site.credentialIv, tag: site.credentialTag }) });
    await client.checkActorSyncSupport();
  } catch (error) { throw new ApiError(actorSyncErrorMessage(error), error instanceof ApiError ? error.status : 502); }
}

export async function syncActorToSite(actorId: string, siteId: string, user: Actor, options: { createOnly?: boolean } = {}) {
  const requestId = randomUUID();
  const record = await prisma.actor.findUnique({ where: { id: actorId } });
  const payload = record ? actorPayload(record) : null;
  // Durable intent: no remote write when audit storage is unavailable.
  await prisma.auditLog.create({ data: { actorId: user.id, actorRole: user.role, action: "actor_sync_started",
    resourceType: "actor", resourceId: actorId, metadata: { requestId, siteId, payload, createOnly: Boolean(options.createOnly) } } });
  try {
    if (!payload) throw new ApiError("ไม่พบนักแสดง", 404);
    const result = await prisma.$transaction(async tx => {
      const locks = await tx.$queryRaw<{ locked: boolean }[]>
        `SELECT pg_try_advisory_xact_lock(hashtextextended(${"actor-sync:" + siteId}, 0)) AS locked`;
      if (!locks[0]?.locked) throw new ApiError("เว็บไซต์นี้กำลังรับข้อมูล กรุณาลองใหม่", 409);
      // Check the mapping schema before remote I/O: never write remotely when migration is missing.
      const schema = await tx.$queryRaw<{ ready: boolean }[]>`SELECT to_regclass('actor_syncs') IS NOT NULL AS ready`;
      if (!schema[0]?.ready) throw new ApiError("กรุณารัน migration นักแสดงก่อนเริ่มส่ง", 503);
      const current = await tx.actor.findUnique({ where: { id: actorId } });
      if (!current || actorFingerprint(actorPayload(current)) !== actorFingerprint(payload)) throw new ApiError("ข้อมูลเปลี่ยนระหว่างส่ง กรุณาลองใหม่", 409);
      const site = await tx.targetSite.findUnique({ where: { id: siteId } });
      if (!site?.isActive) throw new ApiError("เว็บไซต์ไม่พร้อมรับข้อมูลหรือถูกปิดใช้งาน", 400);
      const client = new WordPressClient({ baseUrl: site.baseUrl, authType: site.authType, username: site.wpUsername,
        credential: decrypt({ ciphertext: site.credentialEnc, iv: site.credentialIv, tag: site.credentialTag }) });
      const remote = await client.syncActor(payload, { createOnly: options.createOnly });
      // An existing remote record was intentionally left untouched, so do not claim its
      // contents match the current local payload in the synchronization mapping.
      if (remote.status !== "existing") {
        // term_id is nullable: an older plugin version that has not yet been
        // redeployed with actor-taxonomy support omits termId, and this must
        // not fail the whole sync — the CPT record still gets tracked, and a
        // future re-push (after the plugin is updated) backfills the term.
        await tx.$executeRaw`INSERT INTO actor_syncs (actor_id, site_id, remote_id, term_id, payload_hash, synced_at)
          VALUES (${actorId}, ${siteId}, ${remote.remoteId}, ${remote.termId ?? null}, ${actorFingerprint(payload)}, NOW())
          ON CONFLICT (actor_id, site_id) DO UPDATE SET remote_id = EXCLUDED.remote_id,
          term_id = EXCLUDED.term_id, payload_hash = EXCLUDED.payload_hash, synced_at = EXCLUDED.synced_at`;
      }
      return { actorId, siteId, remoteId: remote.remoteId, termId: remote.termId ?? null, status: remote.status! };
    }, { timeout: 90_000, maxWait: 5000 });
    await prisma.auditLog.create({ data: { actorId: user.id, actorRole: user.role, action: "actor_sync_finished",
      resourceType: "actor", resourceId: actorId, metadata: { requestId, ...result } } });
    return result;
  } catch (error) {
    const message = actorSyncErrorMessage(error);
    await prisma.auditLog.create({ data: { actorId: user.id, actorRole: user.role, action: "actor_sync_failed",
      resourceType: "actor", resourceId: actorId, metadata: { requestId, siteId, message } } });
    return { actorId, siteId, status: "failed" as const, message };
  }
}
