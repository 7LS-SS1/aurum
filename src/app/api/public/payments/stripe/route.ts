import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, apiError, jsonOk } from "@/lib/api-response";
import { requireViewerFromRequest } from "@/lib/viewer-auth";
import { readServicePageBody, servicePageOriginAllowed } from "@/lib/service-page-request";
import { listStripeOrders, prepareStripePayment, reconcileStripeOrder } from "@/lib/stripe-orders";
import { rateLimit } from "@/lib/rate-limit";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
export async function GET(request: NextRequest) {
  try { const viewer = await requireViewerFromRequest(request); return jsonOk({ orders: await listStripeOrders(viewer.id), sandbox: true, enabled: process.env.STRIPE_ENABLED === "true" }, { headers }); }
  catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try {
    const viewer = await requireViewerFromRequest(request);
    if (!servicePageOriginAllowed(request.headers.get("origin"), request.url)) throw new ApiError("invalid_origin", 403);
    if (!(await rateLimit(`stripe:viewer:${viewer.id}`, { limit: 12, windowMs: 60000 })).success) throw new ApiError("rate_limited", 429);
    const { id, action } = z.object({ id: z.string().uuid(), action: z.enum(["prepare", "check"]) }).strict().parse(await readServicePageBody(request));
    return jsonOk({ order: action === "prepare" ? await prepareStripePayment(id, viewer.id) : await reconcileStripeOrder(id, viewer.id) }, { headers });
  } catch (error) { return apiError(error); }
}
