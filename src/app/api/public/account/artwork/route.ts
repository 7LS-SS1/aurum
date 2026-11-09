import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireViewerFromRequest } from "@/lib/viewer-auth";
import { requireMinRole } from "@/lib/authz";
import { ApiError, apiError, jsonOk } from "@/lib/api-response";
import { readServicePageBody, servicePageOriginAllowed } from "@/lib/service-page-request";
import { artworkRequestSchema, requestArtwork, artworkDecisionSchema, decideArtwork } from "@/lib/ads-artwork";
import { rateLimit } from "@/lib/rate-limit";
export async function GET(req: NextRequest) {
  try {
    const id = z.string().uuid().parse(req.nextUrl.searchParams.get("id"));
    const admin = req.nextUrl.searchParams.get("admin") === "1";
    const viewer = admin ? (await requireMinRole("MANAGER"), null) : await requireViewerFromRequest(req);
    const order = await prisma.adsOrder.findFirst({ where: { id, ...(viewer ? { viewerId: viewer.id } : {}) }, select: { id: true, status: true, slots: true, quote: true, currentArtwork: true } });
    if (!order) throw new ApiError("not_found", 404);
    const quote = order.quote as { attachments?: unknown };
    return jsonOk({ status: order.status, slots: order.slots, assets: order.currentArtwork || quote.attachments || [], requests: await prisma.adsArtworkRequest.findMany({ where: { orderId: id }, orderBy: { createdAt: "desc" }, take: 100 }) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
export async function POST(req: NextRequest) {
  try {
    const viewer = await requireViewerFromRequest(req);
    if (!servicePageOriginAllowed(req.headers.get("origin"), req.url)) throw new ApiError("invalid_origin", 403);
    if (!(await rateLimit(`artwork:${viewer.id}`, { limit: 30, windowMs: 3600000 })).success) throw new ApiError("rate_limited", 429);
    return jsonOk(await requestArtwork(artworkRequestSchema.parse(await readServicePageBody(req)), viewer.id));
  } catch (error) { return apiError(error); }
}
export async function PATCH(req: NextRequest) {
  try {
    const actor = await requireMinRole("MANAGER");
    if (!servicePageOriginAllowed(req.headers.get("origin"), req.url)) throw new ApiError("invalid_origin", 403);
    return jsonOk(await decideArtwork(artworkDecisionSchema.parse(await readServicePageBody(req)), actor));
  } catch (error) { return apiError(error); }
}
