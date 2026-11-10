import { resolveAdsKey } from "@/lib/ads-plugin-keys";
import { NextRequest } from "next/server";
import { apiError, ApiError, jsonOk } from "@/lib/api-response";
import { locked, orderWebsite } from "@/lib/ads-orders";
import { getAdsPage } from "@/lib/ads-page-store";
import { getInventory, occupiedPhysicalSlots } from "@/lib/ads-booking";
import { reservedStatuses } from "@/lib/ads-inventory-status";
import { getSimulation } from "@/lib/ads-simulation";
import { authenticateAdsPlugin, adFiles, isServingAd, mediaSignature } from "@/lib/ads-plugin";
import { rateLimit } from "@/lib/rate-limit";
export async function GET(req: NextRequest) {
  try {
    const siteId = req.nextUrl.searchParams.get("websiteId") || "";
    const key = await resolveAdsKey(siteId);
    authenticateAdsPlugin(siteId, req.headers.get("authorization"), key);
    if (!(await rateLimit("ads-plugin:"+siteId, { limit: 30, windowMs: 60000 })).success) throw new ApiError("rate_limited", 429);
    const { config } = await getAdsPage();
    if (!config.websites.some(s => s.id === siteId)) throw new ApiError("website_unavailable", 404);
    const orders = await locked(tx => tx.adsOrder.findMany({ where: { status: { in: reservedStatuses } } }));
    const scoped = orders.filter(o => !getSimulation(o.quote) && (!orderWebsite(o.quote) || orderWebsite(o.quote) === siteId));
    const expires = Math.floor(Date.now()/1000)+600;
    const origin = new URL(process.env.SERVICE_PUBLIC_ORIGIN || "https://aurum123.com").origin;
    const slots = getInventory(config).map(slot => {
      const owners = scoped.filter(o => occupiedPhysicalSlots(o.slots).includes(slot.id));
      // Ambiguous legacy assignments stay locked without rendering overlapping ads.
      const serving = owners.filter(o => isServingAd(o));
      const owner = serving.length === 1 && owners.every(o => orderWebsite(o.quote) === siteId) ? serving[0] : undefined;
      const file = owner && isServingAd(owner) ? adFiles(owner).find(f => f.slot === slot.id) : undefined;
      const media = file && owner ? { targetUrl: file.targetUrl, kind: slot.id.startsWith("video_ad:") ? "video" : "image", url: origin + "/api/public/ads-plugin/media?" + new URLSearchParams({ websiteId: siteId, orderId: owner.id, fileId: file.fileId, expires: String(expires), signature: mediaSignature(siteId, owner.id, file.fileId, expires, key) }), endsAt: new Date(owner.endsAt!.getTime()+(owner.status === "GRACE" ? 72*3600000 : 0)).toISOString() } : null;
      return { id: slot.id, label: slot.label, locked: owners.length > 0, state: serving.length > 1 ? "conflict" : media ? "active" : owners.length ? "reserved" : "available", media };
    });
    return jsonOk({ version: 1, websiteId: siteId, generatedAt: new Date().toISOString(), expiresAt: new Date(expires*1000).toISOString(), slots }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return apiError(e); }
}
