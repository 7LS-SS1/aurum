import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { amountToSatang, validSandboxCheckout, type PromptPay } from "./promptpay";
import { createPromptPayCheckout, promptPayReady, signGatewayJwt, verifiedPaymentReference, verifyGatewayJwt } from "./promptpay-2c2p";

const secret = "unit-test-secret-only";
const payment: PromptPay = { version: 1, provider: "2c2p", environment: "sandbox", merchantID: "TEST", invoiceNo: "1234567890abcdef1234", amountSatang: 150000, currency: "THB", state: "ready", createdAt: new Date().toISOString(), checkoutUrl: null, reference: null, receivedAt: null };
const received = { respCode: "0000", merchantID: "TEST", invoiceNo: payment.invoiceNo, currencyCode: "THB", amount: "1500.00000", channelCode: "ETQ", referenceNo: "REF001" };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("PromptPay gateway boundary", () => {
  it("stays off without configuration and always blocks production/live mode", () => {
    vi.stubEnv("ADS_PROMPTPAY_MODE", ""); expect(promptPayReady()).toBe(false);
    vi.stubEnv("ADS_PROMPTPAY_MODE", "sandbox"); vi.stubEnv("TWOC2P_MERCHANT_ID", "TEST"); vi.stubEnv("TWOC2P_SECRET_KEY", secret); vi.stubEnv("PAYMENTS_PUBLIC_ORIGIN", "https://aurum123.com"); vi.stubEnv("NODE_ENV", "test");
    expect(promptPayReady()).toBe(true);
    vi.stubEnv("NODE_ENV", "production"); expect(promptPayReady()).toBe(false);
    vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("ADS_PROMPTPAY_MODE", "live"); expect(promptPayReady()).toBe(false);
  });
  it("verifies signatures and rejects algorithm confusion, tampering, expired tokens", () => {
    expect(verifyGatewayJwt(signGatewayJwt(received, secret), secret)).toEqual(received);
    expect(() => verifyGatewayJwt(signGatewayJwt(received, "attacker"), secret)).toThrow("invalid_gateway_signature");
    expect(() => verifyGatewayJwt(signGatewayJwt({ ...received, exp: 1 }, secret), secret)).toThrow();
    const input = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url") + "." + Buffer.from(JSON.stringify(received)).toString("base64url");
    expect(() => verifyGatewayJwt(input + "." + createHmac("sha256", secret).update(input).digest("base64url"), secret)).toThrow();
    expect(() => verifyGatewayJwt("a.b.c", secret)).toThrow();
  });
  it("compares exact currency amounts without rounding fractional satang", () => {
    expect(amountToSatang("1500.00000")).toBe(150000);
    expect(amountToSatang("0.01")).toBe(1);
    for (const value of ["1e3", "-1", "10.001", NaN, " 100", "1,500"]) expect(amountToSatang(value)).toBeNull();
  });
  it("requires matching merchant, invoice, amount, currency, channel and transaction reference", () => {
    expect(verifiedPaymentReference(received, payment)).toBe("REF001");
    for (const patch of [{ merchantID: "OTHER" }, { invoiceNo: "other" }, { amount: "1499.99" }, { currencyCode: "USD" }, { channelCode: "VI" }, { referenceNo: "" }]) expect(() => verifiedPaymentReference({ ...received, ...patch }, payment)).toThrow("gateway_payment_mismatch");
    expect(verifiedPaymentReference({ respCode: "1000" }, payment)).toBeNull();
  });
  it("never follows an untrusted or live checkout URL", () => {
    expect(validSandboxCheckout("https://sandbox-pgw-ui.2c2p.com/payment/4.5/#/token/test")).toBe(true);
    for (const url of ["https://pgw-ui.2c2p.com", "http://sandbox-pgw-ui.2c2p.com", "https://sandbox-pgw-ui.2c2p.com.evil.test", "https://x@sandbox-pgw-ui.2c2p.com", "javascript:alert(1)"]) expect(validSandboxCheckout(url)).toBe(false);
  });
  it("sends one signed PPQR request with fixed callbacks and reuses invoice/idempotency identity", async () => {
    const mock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://sandbox-pgw.2c2p.com/payment/4.5/paymentToken");
      const payload = verifyGatewayJwt(JSON.parse(String(init.body)).payload, secret);
      expect(payload.paymentChannel).toEqual(["PPQR"]); expect(payload.amount).toBe(1500); expect(payload.currencyCode).toBe("THB");
      expect(payload.invoiceNo).toBe(payment.invoiceNo); expect(payload.idempotencyID).toBe("aurum-promptpay-order1");
      expect(payload.backendReturnUrl).toBe("https://aurum123.com/api/public/payments/2c2p/webhook");
      expect(payload.frontendReturnUrl).toBe("https://aurum123.com/api/public/payments/2c2p/return/order1");
      expect(init.redirect).toBe("error");
      return Response.json({ payload: signGatewayJwt({ respCode: "0000", webPaymentUrl: "https://sandbox-pgw-ui.2c2p.com/payment/test" }, secret) });
    });
    vi.stubGlobal("fetch", mock);
    expect(await createPromptPayCheckout("order1", payment, { merchantID: "TEST", secret, origin: "https://aurum123.com" })).toContain("sandbox-pgw-ui");
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
