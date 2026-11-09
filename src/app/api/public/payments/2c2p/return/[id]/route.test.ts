import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

afterEach(() => vi.unstubAllEnvs());
describe("2C2P browser return", () => {
  it("ignores claimed success and redirects POST to the authenticated order page", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ADS_PROMPTPAY_MODE", "sandbox");
    vi.stubEnv("TWOC2P_MERCHANT_ID", "TEST");
    vi.stubEnv("TWOC2P_SECRET_KEY", "test-only");
    vi.stubEnv("PAYMENTS_PUBLIC_ORIGIN", "https://aurum123.com");
    const id = "c9e72769-0b6e-46ec-8b21-4431d56549ca";
    const request = new Request(`https://aurum123.com/api/public/payments/2c2p/return/${id}`, { method: "POST", body: "paymentResponse=forged-success&redirect=https://evil.test" });
    const response = await POST(request, { params: Promise.resolve({ id }) });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`https://aurum123.com/services/ads-banner/checkout/${id}`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(request.bodyUsed).toBe(false);
  });
});
