import { ApiError, apiError, jsonOk } from "@/lib/api-response";
import { stripeClient } from "@/lib/stripe-config";
import { handleStripeEvent } from "@/lib/stripe-orders";
import { readStripeWebhook } from "@/lib/stripe-webhook";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const { client } = stripeClient();
    const event = await readStripeWebhook(request, client, process.env.STRIPE_WEBHOOK_SECRET || "");
    return jsonOk(await handleStripeEvent(event), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error instanceof ApiError ? error : new ApiError("stripe_webhook_processing_failed", 503));
  }
}
