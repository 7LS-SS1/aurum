import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { decrypt } from "./crypto";
import { WordPressClient } from "./wordpress-client";
import { actorPayload, actorFingerprint } from "./actor-sync-contract";
import type { Actor } from "./authz";
import { ApiError } from "./api-response";

export async function syncActorToSite(actorId: string, siteId: string, user: Actor) {
  const requestId = randomUUID();
  const record = await prisma.actor.findUnique({ where: { id: actorId } });
  const payload = record ? actorPayload(record) : null;
  // Durable intent: no remote write when audit storage is unavailable.
  await prisma.auditLog.create({ data: { actorId: user.id, actorRole: user.role, action: "actor_sync_started",
    resourceType: "actor", resourceId: actorId, metadata: { requestId, siteId, payload } } });
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
      const remote = await client.syncActor(payload);
      await tx.$executeRaw`INSERT INTO actor_syncs (actor_id, site_id, remote_id, payload_hash, synced_at)
        VALUES (${actorId}, ${siteId}, ${remote.remoteId}, ${actorFingerprint(payload)}, NOW())
        ON CONFLICT (actor_id, site_id) DO UPDATE SET remote_id = EXCLUDED.remote_id,
        payload_hash = EXCLUDED.payload_hash, synced_at = EXCLUDED.synced_at`;
      return { actorId, siteId, remoteId: remote.remoteId, status: remote.status! };
    }, { timeout: 90_000, maxWait: 5000 });
    await prisma.auditLog.create({ data: { actorId: user.id, actorRole: user.role, action: "actor_sync_finished",
      resourceType: "actor", resourceId: actorId, metadata: { requestId, ...result } } });
    return result;
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "ส่งไม่สำเร็จ กรุณาตรวจปลั๊กอิน สิทธิ์ และการเชื่อมต่อปลายทาง แล้วลองใหม่";
    await prisma.auditLog.create({ data: { actorId: user.id, actorRole: user.role, action: "actor_sync_failed",
      resourceType: "actor", resourceId: actorId, metadata: { requestId, siteId, message } } });
    return { actorId, siteId, status: "failed" as const, message };
  }
}
