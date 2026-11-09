import { NextRequest } from "next/server";
import { z } from "zod";
import { requireMinRole } from "@/lib/authz";
import { ApiError, apiError, jsonOk } from "@/lib/api-response";
import { readServicePageBody, servicePageOriginAllowed } from "@/lib/service-page-request";
import { stripeDraftSchema } from "@/lib/stripe-policy";
import { closeStripeBannerRefund, confirmStripeBanner, createStripeDraft, finalizeStripeInvoice, listStripeOrders, prepareStripePayment, reconcileStripeOrder } from "@/lib/stripe-orders";
import { rateLimit } from "@/lib/rate-limit";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
export async function GET() {
  try { await requireMinRole("MANAGER"); return jsonOk({ orders: await listStripeOrders(), sandbox: true, enabled: process.env.STRIPE_ENABLED === "true" }, { headers }); }
  catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try {
    const actor = await requireMinRole("MANAGER");
    if (!servicePageOriginAllowed(request.headers.get("origin"), request.url)) throw new ApiError("invalid_origin", 403);
    if (!(await rateLimit(`stripe:admin:${actor.id}`, { limit: 30, windowMs: 60000 })).success) throw new ApiError("rate_limited", 429);
    return jsonOk({ order: await createStripeDraft(stripeDraftSchema.parse(await readServicePageBody(request)), actor) }, { headers });
  } catch (error) { return apiError(error); }
}
export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireMinRole("MANAGER");
    if (!servicePageOriginAllowed(request.headers.get("origin"), request.url)) throw new ApiError("invalid_origin", 403);
    if (!(await rateLimit(`stripe:admin:${actor.id}`, { limit: 30, windowMs: 60000 })).success) throw new ApiError("rate_limited", 429);
    const { id, action, removalConfirmed } = z.object({ id: z.string().uuid(), action: z.enum(["prepare", "finalize", "check", "confirm_banner", "close_refund"]), removalConfirmed: z.boolean().optional() }).strict().parse(await readServicePageBody(request));
    const order = action === "prepare" ? await prepareStripePayment(id) : action === "finalize" ? await finalizeStripeInvoice(id) : action === "confirm_banner" ? await confirmStripeBanner(id, actor) : action === "close_refund" ? await closeStripeBannerRefund(id, actor, removalConfirmed === true) : await reconcileStripeOrder(id);
    return jsonOk({ order }, { headers });
  } catch (error) { return apiError(error); }
}
