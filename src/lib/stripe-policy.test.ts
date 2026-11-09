import { describe, expect, it, afterEach, vi } from "vitest";
import Stripe from "stripe";
import { canRetryStripeCreation, safeStripeUrl, stripeDraftSchema, verifyStripeTotal, verifyStripeCustomer } from "./stripe-policy";
import { stripeSettings } from "./stripe-config";
import { readStripeWebhook } from "./stripe-webhook";
afterEach(() => vi.unstubAllEnvs());
describe("Stripe boundaries", () => {
  it("rejects payments belonging to a different Stripe customer", () => {
    expect(() => verifyStripeCustomer({ customerId: "cus_expected" }, "cus_other")).toThrow("stripe_customer_mismatch");
    expect(() => verifyStripeCustomer({ customerId: null }, null)).toThrow("stripe_customer_mismatch");
    expect(() => verifyStripeCustomer({ customerId: "cus_expected" }, { id: "cus_expected" })).not.toThrow();
  });
  it("accepts only exact hosted payment domains", () => {
    expect(safeStripeUrl("https://checkout.stripe.com/c/pay/cs_test", "CHECKOUT")).toBeTruthy();
    for (const url of ["http://checkout.stripe.com/test", "https://checkout.stripe.com.evil.test/test", "https://user:pass@checkout.stripe.com/test", "javascript:alert(1)"]) expect(safeStripeUrl(url, "CHECKOUT")).toBeNull();
  });
  it("rejects altered totals, currency, environment and metadata", () => {
    const order = { id: "test", amountSatang: 10000 }, good = { livemode: false, currency: "thb", total: 10000, metadata: { aurumOrderId: "test" } };
    expect(() => verifyStripeTotal(order, good)).not.toThrow();
    for (const changed of [{ total: 9999 }, { currency: "usd" }, { livemode: true }, { metadata: { aurumOrderId: "other" } }]) expect(() => verifyStripeTotal(order, { ...good, ...changed })).toThrow("stripe_payment_mismatch");
  });
  it("does not recreate an uncertain intent after idempotency retention", () => {
    expect(canRetryStripeCreation(new Date(0), null, 24 * 3600000)).toBe(false);
    expect(canRetryStripeCreation(new Date(0), "cs_test_existing", 48 * 3600000)).toBe(true);
  });
  it("does not accept client prices for Banner orders", () => {
    expect(stripeDraftSchema.safeParse({ kind: "BANNER", requestId: crypto.randomUUID(), bannerOrderId: crypto.randomUUID(), mode: "CHECKOUT", amountSatang: 1 }).success).toBe(false);
  });
  it("requires sandbox keys, a test database confirmation and explicit enablement", () => {
    vi.stubEnv("STRIPE_ENABLED", "false");
    expect(() => stripeSettings(true)).toThrow("stripe_disabled");
    vi.stubEnv("STRIPE_ENVIRONMENT", "sandbox"); vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_forbidden");
    expect(() => stripeSettings()).toThrow("stripe_sandbox_required");
    vi.stubEnv("STRIPE_SECRET_KEY", "rk_test_fixture"); vi.stubEnv("STRIPE_SANDBOX_DB_CONFIRMED", "false");
    expect(() => stripeSettings()).toThrow("stripe_test_database_required");
  });
});
describe("raw signed webhook", () => {
  const stripe = new Stripe("sk_test_fixture"), secret = "whsec_local_signature_test";
  const payload = JSON.stringify({ id: "evt_fixture", type: "checkout.session.completed", livemode: false, data: { object: { id: "cs_test_fixture" } } });
  function request(body: string, header?: string) { return new Request("http://localhost/api/public/payments/stripe/webhook", { method: "POST", body, headers: header ? { "stripe-signature": header } : {} }); }
  it("verifies a real SDK signature without parsing/re-encoding the body", async () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect((await readStripeWebhook(request(payload, header), stripe, secret)).id).toBe("evt_fixture");
    await expect(readStripeWebhook(request(payload + " ", header), stripe, secret)).rejects.toThrow("invalid_stripe_signature");
  });
  it("rejects missing, wrong and expired signatures", async () => {
    await expect(readStripeWebhook(request(payload), stripe, secret)).rejects.toThrow("invalid_stripe_signature");
    for (const header of [stripe.webhooks.generateTestHeaderString({ payload, secret: "wrong" }), stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp: 1 })]) await expect(readStripeWebhook(request(payload, header), stripe, secret)).rejects.toThrow("invalid_stripe_signature");
  });
  it("bounds the request before processing", async () => {
    await expect(readStripeWebhook(request("x".repeat(1024 * 1024 + 1), "anything"), stripe, secret)).rejects.toThrow("body_too_large");
  });
});
