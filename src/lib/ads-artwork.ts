import { z } from "zod";
import { Prisma } from "@prisma/client";
import { locked } from "./ads-orders";
import { readAttachment } from "./ads-attachments";
import { ApiError } from "./api-response";
import { orderAlert } from "./ads-notification-events";
import { orderNotice } from "./customer-notices";
import type { Actor } from "./authz";
export const artworkRequestSchema = z.object({ orderId: z.string().uuid(), requestId: z.string().uuid(), slot: z.string().max(60), fileId: z.string().uuid(), targetUrl: z.string().url().max(2000).refine(v => new URL(v).protocol === "https:"), note: z.string().trim().min(3).max(2000) }).strict();
export async function requestArtwork(input: z.infer<typeof artworkRequestSchema>, viewerId: string) {
  return locked(async tx => {
    const order = await tx.adsOrder.findFirst({ where: { id: input.orderId, viewerId } });
    if (!order) throw new ApiError("not_found", 404);
    const previous = await tx.adsArtworkRequest.findUnique({ where: { requestId: input.requestId } });
    if (previous) {
      if (previous.orderId !== order.id || previous.slot !== input.slot || previous.fileId !== input.fileId || previous.targetUrl !== input.targetUrl || previous.note !== input.note) throw new ApiError("request_conflict", 409);
      return previous;
    }
    if (!["PAID", "ACTIVE", "GRACE"].includes(order.status) || !order.slots.includes(input.slot)) throw new ApiError("artwork_not_available", 409);
    if (await tx.adsArtworkRequest.findFirst({ where: { orderId: order.id, slot: input.slot, status: { in: ["OPEN", "APPROVED"] } } })) throw new ApiError("request_pending", 409);
    const file = await readAttachment(input.fileId);
    if (file.owner !== viewerId || (input.slot.startsWith("video_ad:") ? file.type !== "video/mp4" : !file.type.startsWith("image/"))) throw new ApiError("invalid_attachment", 422);
    const item = await tx.adsArtworkRequest.create({ data: { ...input, fileName: file.name } });
    await orderAlert(tx, { orderId: order.id, key: `artwork:${item.id}`, kind: "OTHER_ISSUE", title: "ลูกค้าขอเปลี่ยน Artwork", message: `${input.slot}: ${input.note}` });
    await tx.auditLog.create({ data: { actorRole: "SYSTEM", action: "ads_order_artwork_requested", resourceType: "ads_order", resourceId: order.id, metadata: { note: input.note, requestId: item.id, slot: input.slot, fileId: file.id } } });
    return item;
  });
}
export const artworkDecisionSchema = z.object({ id: z.string().uuid(), revision: z.number().int().positive(), action: z.enum(["approve", "reject", "install"]), response: z.string().trim().min(3).max(2000), proofUrl: z.string().url().max(2000).refine(v => new URL(v).protocol === "https:").optional() }).strict();
export async function decideArtwork(input: z.infer<typeof artworkDecisionSchema>, actor: Actor) {
  return locked(async tx => {
    const item = await tx.adsArtworkRequest.findUnique({ where: { id: input.id }, include: { order: true } });
    if (!item) throw new ApiError("not_found", 404);
    if (item.revision !== input.revision) throw new ApiError("revision_conflict", 409);
    if (!["PAID", "ACTIVE", "GRACE"].includes(item.order.status)) throw new ApiError("artwork_not_available", 409);
    if (input.action === "install" ? item.status !== "APPROVED" || !input.proofUrl : item.status !== "OPEN") throw new ApiError("invalid_transition", 409);
    const status = { approve: "APPROVED", reject: "REJECTED", install: "INSTALLED" }[input.action];
    if (input.action === "install") {
      const quote = item.order.quote as Prisma.JsonObject;
      const original = item.order.currentArtwork || quote.attachments;
      const assets = Array.isArray(original) ? original.filter((a): a is Prisma.JsonObject => !!a && typeof a === "object" && !Array.isArray(a)) : [];
      const next = assets.filter(a => a.slot !== item.slot);
      next.push({ slot: item.slot, fileId: item.fileId, name: item.fileName, targetUrl: item.targetUrl, installedAt: new Date().toISOString(), proofUrl: input.proofUrl! });
      await tx.adsOrder.update({ where: { id: item.orderId }, data: { currentArtwork: next, revision: { increment: 1 } } });
    }
    const updated = await tx.adsArtworkRequest.update({ where: { id: item.id }, data: { status, response: input.response, proofUrl: input.proofUrl, revision: { increment: 1 } } });
    await tx.auditLog.create({ data: { actorId: actor.id, actorRole: actor.role, action: "ads_order_artwork_" + input.action, resourceType: "ads_order", resourceId: item.orderId, metadata: { note: input.response, requestId: item.id, slot: item.slot, fileId: item.fileId, proofUrl: input.proofUrl ?? null } } });
    await orderNotice(tx, item.orderId, `artwork:${item.id}:${updated.revision}`, "อัปเดตการเปลี่ยน Artwork", input.response);
    return updated;
  });
}
