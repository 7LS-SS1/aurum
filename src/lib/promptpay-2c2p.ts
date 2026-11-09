import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ApiError } from "./api-response";
import { amountToSatang, validSandboxCheckout, type PromptPay } from "./promptpay";

export type PromptPayConfig = { merchantID: string; secret: string; origin: string };
// This release deliberately cannot contact a production payment endpoint.
// Live credentials require a separate go-live review after merchant acceptance.
export function promptPayConfig(): PromptPayConfig {
  if (process.env.ADS_PROMPTPAY_MODE !== "sandbox" || process.env.NODE_ENV === "production") throw new ApiError("promptpay_not_ready", 503);
  const merchantID = process.env.TWOC2P_MERCHANT_ID || "";
  const secret = process.env.TWOC2P_SECRET_KEY || "";
  let origin: URL;
  try { origin = new URL(process.env.PAYMENTS_PUBLIC_ORIGIN || ""); }
  catch { throw new ApiError("promptpay_not_ready", 503); }
  if (!/^[A-Za-z0-9]{1,25}$/.test(merchantID) || !secret || origin.protocol !== "https:" || origin.username || origin.password || origin.port || origin.pathname !== "/" || origin.search || origin.hash) throw new ApiError("promptpay_not_ready", 503);
  return { merchantID, secret, origin: origin.origin };
}
export function promptPayReady() { try { promptPayConfig(); return true; } catch { return false; } }

export function signGatewayJwt(data: Record<string, unknown>, secret: string) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const input = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(data)}`;
  return `${input}.${createHmac("sha256", secret).update(input).digest("base64url")}`;
}
export function verifyGatewayJwt(value: unknown, secret: string): Record<string, unknown> {
  try {
    if (typeof value !== "string" || value.length > 100_000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) throw Error();
    const [header, payload, signature] = value.split(".") as [string, string, string];
    const expected = createHmac("sha256", secret).update(`${header}.${payload}`).digest();
    const received = Buffer.from(signature, "base64url");
    if (received.length !== expected.length || !timingSafeEqual(expected, received)) throw Error();
    const h = JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
    if (h.alg !== "HS256" || h.crit || (h.typ && h.typ !== "JWT")) throw Error();
    const data = z.record(z.string(), z.unknown()).parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    const now = Date.now() / 1000;
    if (data.exp !== undefined && (typeof data.exp !== "number" || data.exp <= now)) throw Error();
    if (data.nbf !== undefined && (typeof data.nbf !== "number" || data.nbf > now + 30)) throw Error();
    return data;
  } catch { throw new ApiError("invalid_gateway_signature", 400); }
}
async function gatewayRequest(endpoint: "paymentToken" | "paymentInquiry", payload: Record<string, unknown>, config: PromptPayConfig) {
  let response: Response;
  try {
    response = await fetch(`https://sandbox-pgw.2c2p.com/payment/4.5/${endpoint}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, redirect: "error", cache: "no-store",
      signal: AbortSignal.timeout(15000), body: JSON.stringify({ payload: signGatewayJwt(payload, config.secret) }),
    });
  } catch { throw new ApiError("gateway_unavailable", 503); }
  if (!response.ok) throw new ApiError("gateway_unavailable", 503);
  const body: unknown = await response.json().catch(() => null);
  if (!body || typeof body !== "object" || !("payload" in body)) throw new ApiError("gateway_invalid_response", 502);
  return verifyGatewayJwt(body.payload, config.secret);
}
export async function createPromptPayCheckout(orderId: string, payment: PromptPay, config = promptPayConfig()) {
  if (payment.merchantID !== config.merchantID) throw new ApiError("gateway_account_changed", 409);
  const data = await gatewayRequest("paymentToken", {
    merchantID: config.merchantID, invoiceNo: payment.invoiceNo, idempotencyID: `aurum-promptpay-${orderId}`,
    description: "Website advertising placement", amount: payment.amountSatang / 100, currencyCode: "THB",
    paymentChannel: ["PPQR"], locale: "th", nonceStr: randomBytes(16).toString("hex"),
    frontendReturnUrl: `${config.origin}/api/public/payments/2c2p/return/${orderId}`,
    backendReturnUrl: `${config.origin}/api/public/payments/2c2p/webhook`,
  }, config);
  if (data.respCode !== "0000" || typeof data.webPaymentUrl !== "string" || !validSandboxCheckout(data.webPaymentUrl)) throw new ApiError("gateway_checkout_unavailable", 502);
  return data.webPaymentUrl;
}
export async function inquirePromptPay(payment: PromptPay, config = promptPayConfig()) {
  if (payment.merchantID !== config.merchantID) throw new ApiError("gateway_account_changed", 409);
  return gatewayRequest("paymentInquiry", { merchantID: config.merchantID, invoiceNo: payment.invoiceNo, locale: "en" }, config);
}
export function verifiedPaymentReference(data: Record<string, unknown>, payment: PromptPay): string | null {
  // Any non-success/unknown response remains inconclusive. It never releases inventory or marks paid.
  if (data.respCode !== "0000") return null;
  if (data.merchantID !== payment.merchantID || data.invoiceNo !== payment.invoiceNo || data.currencyCode !== "THB" || amountToSatang(data.amount) !== payment.amountSatang || data.channelCode !== "ETQ" || typeof data.referenceNo !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(data.referenceNo)) throw new ApiError("gateway_payment_mismatch", 409);
  return data.referenceNo;
}
