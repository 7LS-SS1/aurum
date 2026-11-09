import type Stripe from "stripe";
import { ApiError } from "./api-response";

type SettlementOrder = { remoteId: string | null; createdAt: Date; paidAt: Date | null };
function settlementTime(event: Stripe.Event, row: SettlementOrder, intentId: string): Date | null {
  if (event.livemode || event.account || !Number.isSafeInteger(event.created)) return null;
  const object = event.data.object as unknown as { id: string; status?: string; payment_status?: string; payment_intent?: string | { id: string } };
  const intent = typeof object.payment_intent === "string" ? object.payment_intent : object.payment_intent?.id;
  const matches = event.type === "payment_intent.succeeded" ? object.id === intentId && object.status === "succeeded"
    : ["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type) && object.id === row.remoteId && intent === intentId && object.payment_status === "paid";
  const time = event.created * 1000;
  return matches && time >= row.createdAt.getTime() - 1000 && time <= Date.now() + 1000 ? new Date(time) : null;
}

// Only pass events verified by the webhook signature, or retrieved from Stripe.
export async function checkoutSettlementTime(client: Stripe, row: SettlementOrder, intentId: string, event?: Stripe.Event) {
  if (row.paidAt) return row.paidAt;
  const delivered = event && settlementTime(event, row, intentId);
  if (delivered) return delivered;
  let cursor: string | undefined;
  for (let page = 0; page < 3; page++) {
    const events = await client.events.list({ type: "payment_intent.succeeded", limit: 100, created: { gte: Math.max(0, Math.floor(row.createdAt.getTime() / 1000) - 1) }, ...(cursor ? { starting_after: cursor } : {}) });
    for (const candidate of events.data) {
      const time = settlementTime(candidate, row, intentId);
      if (time) return time;
    }
    if (!events.has_more || !events.data.length) break;
    cursor = events.data.at(-1)!.id;
  }
  // Events have limited retention. Never guess from charge creation or arrival time.
  throw new ApiError("stripe_settlement_time_unavailable", 409);
}

export async function fullyRefunded(client: Stripe, charge: Stripe.Charge | null, amount: number) {
  if (!charge || charge.disputed || !charge.refunded || charge.amount_refunded !== amount) return false;
  const refunds = await client.refunds.list({ charge: charge.id, limit: 100 });
  return !refunds.has_more && refunds.data.length > 0 && refunds.data.every(refund =>
    ["succeeded", "failed", "canceled"].includes(refund.status || "") && refund.currency === "thb" &&
    (typeof refund.charge === "string" ? refund.charge : refund.charge?.id) === charge.id) &&
    refunds.data.reduce((total, refund) => total + (refund.status === "succeeded" ? refund.amount : 0), 0) === amount;
}
