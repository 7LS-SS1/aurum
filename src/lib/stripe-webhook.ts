import Stripe from "stripe";
import { ApiError } from "./api-response";

export async function readStripeWebhook(request: Request, client: Stripe, secret: string) {
  if (!secret.startsWith("whsec_")) throw new ApiError("stripe_webhook_not_configured", 503);
  const signature = request.headers.get("stripe-signature");
  if (!signature) throw new ApiError("invalid_stripe_signature", 400);
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError("invalid_stripe_signature", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024) { await reader.cancel(); throw new ApiError("body_too_large", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return client.webhooks.constructEvent(Buffer.concat(chunks), signature, secret); }
  catch { throw new ApiError("invalid_stripe_signature", 400); }
}
