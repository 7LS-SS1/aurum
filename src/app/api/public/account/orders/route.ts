import { NextRequest } from "next/server";
import { z } from "zod";
import { requireViewerFromRequest } from "@/lib/viewer-auth";
import { memberOrders, claimOrder, tokenSchema } from "@/lib/ads-orders";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { readServicePageBody, servicePageOriginAllowed } from "@/lib/service-page-request";
import { rateLimit } from "@/lib/rate-limit";
export async function GET(req: NextRequest) {
  try {
    const viewer = await requireViewerFromRequest(req);
    const cursor = req.nextUrl.searchParams.get("cursor");
    if (cursor) z.string().uuid().parse(cursor);
    return jsonOk(await memberOrders(viewer.id, cursor || undefined), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
export async function POST(req: NextRequest) {
  try {
    const viewer = await requireViewerFromRequest(req);
    if (!servicePageOriginAllowed(req.headers.get("origin"), req.url)) throw new ApiError("invalid_origin", 403);
    if (!(await rateLimit("member-claim:" + viewer.id, { limit: 10, windowMs: 600000 })).success) throw new ApiError("rate_limited", 429);
    const { token } = z.object({ token: tokenSchema }).strict().parse(await readServicePageBody(req));
    return jsonOk(await claimOrder(token, viewer.id));
  } catch (error) { return apiError(error); }
}
