import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  row: {} as Record<string, unknown> & { expiresAt: Date; paidAt: Date | null }, banner: {} as Record<string, unknown>, conflicts: [] as unknown[],
  session: vi.fn(), invoice: vi.fn(), voidInvoice: vi.fn(), payments: vi.fn(), intent: vi.fn(), events: vi.fn(), refunds: vi.fn(), audit: vi.fn(), notice: vi.fn(), alert: vi.fn(),
}));
vi.mock("./prisma", () => {
  const tx = {
    $executeRaw: vi.fn(),
    stripeOrder: {
      findFirst: vi.fn(async () => ({ ...mocks.row })), findUniqueOrThrow: vi.fn(async () => ({ ...mocks.row })),
      update: vi.fn(async ({ data }) => Object.assign(mocks.row, data)),
    },
    adsOrder: {
      findUniqueOrThrow: vi.fn(async () => ({ ...mocks.banner })), findUnique: vi.fn(async () => null), findFirst: vi.fn(async () => null), findMany: vi.fn(async () => mocks.conflicts),
      update: vi.fn(async ({ data }) => Object.assign(mocks.banner, data)),
      updateMany: vi.fn(async ({ where, data }) => { if (where.status.in ? where.status.in.includes(mocks.banner.status) : where.status === mocks.banner.status) Object.assign(mocks.banner, data); }),
    }, auditLog: { create: mocks.audit },
  };
  return { prisma: { ...tx, $transaction: async (fn: (tx: unknown) => unknown) => fn(tx) } };
});
vi.mock("./stripe-config", () => ({ stripeClient: () => ({ settings: { accountId: "acct_test" }, client: {
  checkout: { sessions: { retrieve: mocks.session } }, invoices: { retrieve: mocks.invoice, voidInvoice: mocks.voidInvoice },
  invoicePayments: { list: mocks.payments }, paymentIntents: { retrieve: mocks.intent }, events: { list: mocks.events }, refunds: { list: mocks.refunds },
} }), stripeAccountCheck: vi.fn(), stripeError: (error: unknown) => { throw error; } }));
vi.mock("./customer-notices", () => ({ orderNotice: mocks.notice }));
vi.mock("./ads-notification-events", () => ({ orderAlert: mocks.alert }));
import { closeStripeBannerRefund, prepareStripePayment, reconcileStripeOrder } from "./stripe-orders";
import { prisma } from "./prisma";
import { stripeAccountCheck } from "./stripe-config";

const charge = () => ({ id: "ch_test", refunded: false, amount_refunded: 0, disputed: false });
const intent = () => ({ id: "pi_test", status: "succeeded", amount_received: 10000, currency: "thb", livemode: false, latest_charge: charge() });
const invoice = () => ({ id: "in_test", customer: "cus_test", livemode: false, currency: "thb", total: 10000, metadata: { aurumOrderId: "order" }, status: "paid", amount_paid: 10000, post_payment_credit_notes_amount: 0, pre_payment_credit_notes_amount: 0, status_transitions: { paid_at: Math.floor(Date.now() / 1000) - 120 } });
beforeEach(() => {
  vi.clearAllMocks(); mocks.conflicts = [];
  mocks.row = { id: "order", viewerId: "viewer", accountId: "acct_test", customerId: "cus_test", remoteId: "cs_test_order", bannerOrderId: "banner", mode: "CHECKOUT", status: "OPEN", amountSatang: 10000, paidAt: null, createdAt: new Date(Date.now() - 600000), expiresAt: new Date(Date.now() - 60000) };
  mocks.banner = { id: "banner", status: "EXPIRED", holdUntil: new Date(Date.now() - 60000), amount: 100, slots: ["slot"], quote: { website: { id: "site" } } };
  mocks.session.mockResolvedValue({ id: "cs_test_order", customer: "cus_test", livemode: false, currency: "thb", amount_total: 10000, metadata: { aurumOrderId: "order" }, payment_status: "paid", status: "complete", payment_intent: intent() });
  mocks.events.mockResolvedValue({ has_more: false, data: [{ id: "evt_paid", type: "payment_intent.succeeded", livemode: false, created: Math.floor(Date.now() / 1000) - 120, data: { object: { id: "pi_test", status: "succeeded" } } }] });
  mocks.invoice.mockResolvedValue(invoice()); mocks.intent.mockResolvedValue(intent()); mocks.voidInvoice.mockResolvedValue({});
  mocks.payments.mockResolvedValue({ has_more: false, data: [{ amount_paid: 10000, livemode: false, payment: { type: "payment_intent", payment_intent: "pi_test" } }] });
  mocks.refunds.mockResolvedValue({ has_more: false, data: [{ id: "re_test", charge: "ch_test", status: "succeeded", currency: "thb", amount: 10000 }] });
});

describe("Stripe payment recovery", () => {
  it("rejects another viewer's order before any provider request", async () => {
    vi.mocked(prisma.stripeOrder.findFirst).mockResolvedValueOnce(null);
    await expect(reconcileStripeOrder("order", "other-viewer")).rejects.toThrow("not_found");
    expect(prisma.stripeOrder.findFirst).toHaveBeenLastCalledWith({ where: { id: "order", viewerId: "other-viewer" } });
    vi.mocked(prisma.stripeOrder.findFirst).mockResolvedValueOnce(null);
    await expect(prepareStripePayment("order", "other-viewer")).rejects.toThrow("not_found");
    expect(stripeAccountCheck).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it("returns a local draft without requiring the provider to be available", async () => {
    mocks.row.remoteId = null;
    mocks.row.status = "DRAFT";
    expect((await reconcileStripeOrder("order", "viewer")).status).toBe("DRAFT");
    expect(stripeAccountCheck).not.toHaveBeenCalled();
  });
  it("uses settlement evidence for a delayed payment, preserving the existing order", async () => {
    const result = await reconcileStripeOrder("order");
    expect(result.status).toBe("PAID"); expect(mocks.banner.status).toBe("PAYMENT_REVIEW");
    expect(result.paidAt!.getTime()).toBeLessThan(mocks.row.expiresAt.getTime());
    expect(mocks.notice).toHaveBeenCalledOnce();
  });
  it("does not reallocate a slot when delayed settlement conflicts with another order", async () => {
    mocks.conflicts = [{ quote: { website: { id: "site" } } }];
    expect((await reconcileStripeOrder("order")).status).toBe("REVIEW"); expect(mocks.banner.status).toBe("REFUND_REQUIRED");
  });
  it("does not invent payment times when evidence is unavailable", async () => {
    mocks.events.mockResolvedValue({ has_more: false, data: [] });
    await expect(reconcileStripeOrder("order")).rejects.toThrow("stripe_settlement_time_unavailable");
    expect(mocks.row.status).toBe("OPEN"); expect(mocks.banner.status).toBe("EXPIRED");
  });
  it("voids an overdue open invoice before releasing its reservation", async () => {
    Object.assign(mocks.row, { mode: "INVOICE", remoteId: "in_test" }); mocks.banner.status = "PAYMENT";
    mocks.invoice.mockResolvedValueOnce({ ...invoice(), status: "open", amount_paid: 0 }).mockResolvedValue({ ...invoice(), status: "void", amount_paid: 0 });
    expect((await reconcileStripeOrder("order")).status).toBe("VOID");
    expect(mocks.voidInvoice).toHaveBeenCalledOnce(); expect(mocks.banner.status).toBe("EXPIRED");
  });
  it("retains the reservation if provider expiry fails", async () => {
    Object.assign(mocks.row, { mode: "INVOICE", remoteId: "in_test" }); mocks.banner.status = "PAYMENT";
    mocks.invoice.mockResolvedValue({ ...invoice(), status: "open", amount_paid: 0 }); mocks.voidInvoice.mockRejectedValue(Error("network"));
    await expect(reconcileStripeOrder("order")).rejects.toThrow("stripe_expiry_needs_reconciliation");
    expect(mocks.banner.status).toBe("PAYMENT");
  });
  it("accepts authoritative payment when payment wins the expiry race", async () => {
    Object.assign(mocks.row, { mode: "INVOICE", remoteId: "in_test" }); mocks.banner.status = "PAYMENT";
    mocks.invoice.mockResolvedValueOnce({ ...invoice(), status: "open", amount_paid: 0 }).mockResolvedValue(invoice()); mocks.voidInvoice.mockRejectedValue(Error("already paid"));
    expect((await reconcileStripeOrder("order")).status).toBe("PAID"); expect(mocks.banner.status).toBe("PAYMENT_REVIEW");
  });
  it("verifies full refunds and waits for explicit staff removal before freeing inventory", async () => {
    mocks.row.paidAt = new Date(Date.now() - 120000); mocks.row.status = "PAID"; mocks.banner.status = "ACTIVE";
    mocks.session.mockResolvedValue({ ...(await mocks.session()), payment_intent: { ...intent(), latest_charge: { ...charge(), refunded: true, amount_refunded: 10000 } } });
    expect((await reconcileStripeOrder("order")).status).toBe("REFUNDED"); expect(mocks.banner.status).toBe("REFUND_REQUIRED");
    await expect(closeStripeBannerRefund("order", { id: null, role: "HEAD" }, false)).rejects.toThrow("stripe_removal_confirmation_required");
    await closeStripeBannerRefund("order", { id: null, role: "HEAD" }, true);
    expect(mocks.banner.status).toBe("REFUNDED"); expect(mocks.banner.refundAmount).toBe(100);
    await closeStripeBannerRefund("order", { id: null, role: "HEAD" }, true);
    expect(mocks.audit.mock.calls.filter(([x]) => x.data.action === "stripe_refund_closed")).toHaveLength(1);
  });
  it("does not treat pending refunds as money returned", async () => {
    mocks.row.paidAt = new Date(); mocks.banner.status = "PAID";
    mocks.session.mockResolvedValue({ ...(await mocks.session()), payment_intent: { ...intent(), latest_charge: { ...charge(), refunded: true, amount_refunded: 10000 } } });
    mocks.refunds.mockResolvedValue({ has_more: false, data: [{ charge: "ch_test", currency: "thb", amount: 10000, status: "pending" }] });
    expect((await reconcileStripeOrder("order")).status).toBe("REVIEW");
    await expect(closeStripeBannerRefund("order", { id: null, role: "HEAD" }, true)).rejects.toThrow("stripe_refund_not_complete");
  });
  it("keeps partially refunded or disputed payments in review", async () => {
    mocks.row.paidAt = new Date(); mocks.banner.status = "PAID";
    mocks.session.mockResolvedValue({ ...(await mocks.session()), payment_intent: { ...intent(), latest_charge: { ...charge(), amount_refunded: 5000, disputed: true } } });
    expect((await reconcileStripeOrder("order")).status).toBe("REVIEW"); expect(mocks.refunds).not.toHaveBeenCalled();
  });
  it("counts only successful refunds when an earlier attempt failed", async () => {
    mocks.row.paidAt = new Date(); mocks.banner.status = "PAID";
    mocks.session.mockResolvedValue({ ...(await mocks.session()), payment_intent: { ...intent(), latest_charge: { ...charge(), refunded: true, amount_refunded: 10000 } } });
    mocks.refunds.mockResolvedValue({ has_more: false, data: [
      { charge: "ch_test", currency: "thb", amount: 10000, status: "failed" },
      { charge: "ch_test", currency: "thb", amount: 10000, status: "succeeded" },
    ] });
    expect((await reconcileStripeOrder("order")).status).toBe("REFUNDED");
  });
});
