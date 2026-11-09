import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, ApiError, jsonOk } from "@/lib/api-response";
import { requireViewerFromRequest } from "@/lib/viewer-auth";
import { readServicePageBody, servicePageOriginAllowed } from "@/lib/service-page-request";
import { rateLimit } from "@/lib/rate-limit";
import { readPromptPayOrder, reconcilePromptPay, startPromptPay } from "@/lib/promptpay-orders";
import { promptPayReady } from "@/lib/promptpay-2c2p";

const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
export async function GET(request: NextRequest) {
  try {
    const viewer = await requireViewerFromRequest(request);
    const id = z.string().uuid().parse(request.nextUrl.searchParams.get("id"));
    return jsonOk({ order: await readPromptPayOrder(id, viewer.id), ready: promptPayReady() }, { headers });
  } catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try {
    if (!servicePageOriginAllowed(request.headers.get("origin"), request.url)) throw new ApiError("invalid_origin", 403);
    const viewer = await requireViewerFromRequest(request);
    if (!(await rateLimit("promptpay:" + viewer.id, { limit: 12, windowMs: 60000 })).success) throw new ApiError("rate_limited", 429);
    const { id, action } = z.object({ id: z.string().uuid(), action: z.enum(["create", "check"]) }).strict().parse(await readServicePageBody(request));
    const order = action === "create" ? await startPromptPay(id, viewer.id) : (await reconcilePromptPay(id, viewer.id)).order;
    return jsonOk({ order, ready: promptPayReady() }, { headers });
  } catch (error) { return apiError(error); }
}
