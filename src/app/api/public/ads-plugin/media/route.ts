import { resolveAdsKey } from "@/lib/ads-plugin-keys";
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, ApiError } from "@/lib/api-response";
import { adFiles, isServingAd, validMediaSignature } from "@/lib/ads-plugin";
import { orderWebsite } from "@/lib/ads-orders";
import { getAdsPage } from "@/lib/ads-page-store";
import { readAttachment, attachmentBytes } from "@/lib/ads-attachments";
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams;
    const site = z.string().uuid().parse(q.get("websiteId")), orderId = z.string().uuid().parse(q.get("orderId")), fileId = z.string().uuid().parse(q.get("fileId"));
    if (!validMediaSignature(site, orderId, fileId, Number(q.get("expires")), q.get("signature") || "", await resolveAdsKey(site))) throw new ApiError("invalid_media_link", 403);
    const { config } = await getAdsPage();
    if (!config.websites.some(s => s.id === site)) throw new ApiError("website_unavailable", 404);
    const order = await prisma.adsOrder.findUnique({ where: { id: orderId } });
    if (!order || orderWebsite(order.quote) !== site || !isServingAd(order)) throw new ApiError("inactive_ad", 404);
    const assignment = adFiles(order).find(f => f.fileId === fileId && order.slots.includes(f.slot));
    if (!assignment) throw new ApiError("file_not_assigned", 404);
    const file = await readAttachment(fileId);
    if (file.owner !== order.viewerId || (assignment.slot.startsWith("video_ad:") ? file.type !== "video/mp4" : !["image/png","image/jpeg","image/webp","image/gif"].includes(file.type))) throw new ApiError("invalid_artwork", 422);
    const bytes = await attachmentBytes(fileId);
    const headers = { "Content-Type": file.type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Accept-Ranges": "bytes", "Referrer-Policy": "no-referrer" };
    const range = req.headers.get("range");
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      const start = match ? Number(match[1]) : -1, end = match?.[2] ? Math.min(Number(match[2]), bytes.length-1) : bytes.length-1;
      if (start < 0 || start >= bytes.length || end < start) return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${bytes.length}` } });
      return new Response(new Uint8Array(bytes.subarray(start,end+1)), { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${bytes.length}`, "Content-Length": String(end-start+1) } });
    }
    return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Length": String(bytes.length) } });
  } catch(e) { return apiError(e); }
}
