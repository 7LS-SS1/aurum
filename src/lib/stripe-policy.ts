import { z } from "zod";
import { ApiError } from "./api-response";

export const stripeDraftSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("VIDEO"), requestId: z.string().uuid(), viewerId: z.string().min(1).max(100), title: z.string().trim().min(3).max(200), amountSatang: z.number().int().min(1000).max(99999999), mode: z.enum(["CHECKOUT", "INVOICE"]) }).strict(),
  z.object({ kind: z.literal("BANNER"), requestId: z.string().uuid(), bannerOrderId: z.string().uuid(), mode: z.enum(["CHECKOUT", "INVOICE"]) }).strict(),
]);
export type StripeDraft = z.infer<typeof stripeDraftSchema>;
export function hasStripeBilling(quote: unknown) {
  return !!quote && typeof quote === "object" && "stripeBillingId" in quote;
}
export function safeStripeUrl(value: string | null | undefined, mode: "CHECKOUT" | "INVOICE") {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password && !u.port && u.hostname === (mode === "CHECKOUT" ? "checkout.stripe.com" : "invoice.stripe.com") ? value : null;
  } catch { return null; }
}
export function verifyStripeTotal(expected: { id: string; amountSatang: number }, actual: { livemode: boolean; currency: string | null; total: number | null; metadata: Record<string,string> | null }) {
  if (actual.livemode || actual.currency?.toLowerCase() !== "thb" || actual.total !== expected.amountSatang || actual.metadata?.aurumOrderId !== expected.id)
    throw new ApiError("stripe_payment_mismatch", 409);
}
export function canRetryStripeCreation(startedAt: Date | null, remoteId: string | null, now = Date.now()) {
  // Stripe may prune idempotency records after 24h. Never recreate an uncertain old payment.
  return !!remoteId || !startedAt || now - startedAt.getTime() < 23 * 3600000;
}
export function verifyStripeCustomer(expected: { customerId: string | null }, actual: string | { id: string } | null) {
  if (!expected.customerId || expected.customerId !== (typeof actual === "string" ? actual : actual?.id)) throw new ApiError("stripe_customer_mismatch", 409);
}
