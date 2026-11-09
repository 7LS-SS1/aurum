import { afterEach, describe, expect, it, vi } from "vitest";
import { phoneVerification } from "./phone-verification";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function configured() {
  vi.stubEnv("TWILIO_API_KEY", "test-key"); vi.stubEnv("TWILIO_API_SECRET", "test-secret");
  vi.stubEnv("TWILIO_VERIFY_SERVICE_SID", "VA" + "a".repeat(32));
}
describe("phone proof boundary", () => {
  it("fails closed when no SMS provider is configured", async () => {
    vi.stubEnv("TWILIO_API_KEY", "");
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(phoneVerification("+66812345678")).rejects.toThrow("sms_not_configured");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("requires approved verification for the exact phone", async () => {
    configured();
    for (const result of [{ status: "pending", to: "+66812345678" }, { status: "approved", to: "+66999999999" }]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => result }));
      await expect(phoneVerification("+66812345678", "123456")).rejects.toThrow("invalid_code");
    }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "approved", to: "+66812345678" }) }));
    await expect(phoneVerification("+66812345678", "123456")).resolves.toBeUndefined();
  });
});
