import { describe, it, expect } from "vitest";
import { canCancelUnpaid } from "./ads-order-cancellation";
const order = { status: "PAYMENT", quote: { bankTransfer: { accountId: "22222222-2222-4222-8222-222222222222", state: "awaiting" } } };
describe("unpaid cancellation", () => {
  it("allows only unpaid manual transfers", () => {
    expect(canCancelUnpaid(order)).toBe(true);
    expect(canCancelUnpaid({ ...order, quote: {} })).toBe(false);
    for (const status of ["PAID", "ACTIVE", "PAYMENT_REVIEW", "REJECTED", "REFUNDED"]) expect(canCancelUnpaid({ ...order, status })).toBe(false);
  });
  it("blocks payment evidence and submitted slips", () => {
    expect(canCancelUnpaid({ ...order, paymentReference: "paid" })).toBe(false);
    for (const state of ["review", "more_info", "rejected", "confirmed"]) expect(canCancelUnpaid({ ...order, quote: { bankTransfer: { ...order.quote.bankTransfer, state } } })).toBe(false);
    expect(canCancelUnpaid({ ...order, quote: { bankTransfer: { ...order.quote.bankTransfer, attachmentId: "33333333-3333-4333-8333-333333333333" } } })).toBe(false);
  });
});
