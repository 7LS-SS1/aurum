import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ApiError } from "./api-response";
import { getSimulation } from "./ads-simulation";
export function pluginKey(siteId: string) {
  const keys = z.record(z.string().uuid(), z.string().min(40).max(200)).parse(JSON.parse(process.env.ADS_PLUGIN_KEYS || "{}"));
  const key = keys[siteId];
  if (!key) throw new ApiError("plugin_not_configured", 401);
  return key;
}
export function authenticateAdsPlugin(siteId: string, authorization: string | null, key?: string) {
  z.string().uuid().parse(siteId);
  const expected = key ?? pluginKey(siteId), provided = authorization?.replace(/^Bearer /, "") || "";
  if (!timingSafeEqual(createHash("sha256").update(expected).digest(), createHash("sha256").update(provided).digest())) throw new ApiError("unauthorized", 401);
}
export function mediaSignature(siteId: string, orderId: string, fileId: string, expires: number, key?: string) {
  return createHmac("sha256", key ?? pluginKey(siteId)).update(JSON.stringify([siteId, orderId, fileId, expires])).digest("hex");
}
export function validMediaSignature(siteId: string, orderId: string, fileId: string, expires: number, signature: string, key?: string) {
  if (!Number.isSafeInteger(expires) || expires < Math.floor(Date.now()/1000) || expires > Math.floor(Date.now()/1000)+900 || !/^[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(mediaSignature(siteId, orderId, fileId, expires, key), "hex"));
}
export function isServingAd(order: { status: string; startsAt: Date | null; endsAt: Date | null; quote: unknown }, now = Date.now()) {
  return !getSimulation(order.quote) && ["ACTIVE", "GRACE"].includes(order.status) && !!order.startsAt && order.startsAt.getTime() <= now && !!order.endsAt && order.endsAt.getTime() + (order.status === "GRACE" ? 72*3600000 : 0) > now;
}
export const adFilesSchema = z.array(z.object({ slot: z.string(), fileId: z.string().uuid(), targetUrl: z.string().url().refine(v => v.startsWith("https://")) }));
export function adFiles(order: { currentArtwork: unknown; quote: unknown }) {
  const quote = order.quote && typeof order.quote === "object" ? order.quote as Record<string, unknown> : {};
  return adFilesSchema.parse(order.currentArtwork ?? quote.attachments ?? []);
}
