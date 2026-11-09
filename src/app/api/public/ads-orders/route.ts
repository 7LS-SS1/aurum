import { NextRequest } from "next/server";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { bookingSchema } from "@/lib/ads-booking";
import { availability, createOrder, readOrder } from "@/lib/ads-orders";
import { readServicePageBody, servicePageOriginAllowed } from "@/lib/service-page-request";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getViewerFromRequest, requireViewerFromRequest } from "@/lib/viewer-auth";
import { z } from "zod";

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit("ads-read:" + clientIp(request), { limit: 60, windowMs: 60000 });
    if (!limited.success) throw new ApiError("rate_limited", 429);
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
    const renewal = request.nextUrl.searchParams.get("renewalOfId");
    if (renewal) z.string().uuid().parse(renewal);
    const viewer = renewal ? await requireViewerFromRequest(request) : null;
    return jsonOk(token ? { order: await readOrder(token, (await getViewerFromRequest(request))?.id) } : { occupied: await availability(request.nextUrl.searchParams.get("websiteId") || undefined, renewal || undefined, viewer?.id) }, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try {
    if (!servicePageOriginAllowed(request.headers.get("origin"), request.url)) throw new ApiError("invalid_origin", 403);
    const viewer = await requireViewerFromRequest(request);
    const limited = await rateLimit("ads-create:" + clientIp(request), { limit: 5, windowMs: 3600000 });
    if (!limited.success) throw new ApiError("rate_limited", 429);
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
    const input = bookingSchema.parse(await readServicePageBody(request));
    return jsonOk({ order: await createOrder(input, token, viewer.id) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
