import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("scheduler exit status", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("SERVICE_WORKER_SECRET", "local-test-secret-".repeat(3));
    vi.stubEnv("SERVICE_WORKER_ORIGIN", "http://127.0.0.1:3317");
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  async function invoke(result: unknown, status = 200) {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(result), { status }));
    vi.stubGlobal("fetch", fetcher);
    const script = "./service-worker.mjs";
    await import(script);
    return fetcher;
  }
  it("sends authentication in the header and accepts a successful job", async () => {
    const fetcher = await invoke({ paymentFailures: 0, stripe: { enabled: true, checked: 1, failed: 0 } });
    expect(fetcher).toHaveBeenCalledWith(new URL("http://127.0.0.1:3317/api/internal/service-worker"), expect.objectContaining({ method: "POST", redirect: "error", headers: { authorization: `Bearer ${process.env.SERVICE_WORKER_SECRET}` } }));
  });
  it("fails on a degraded Stripe run even when HTTP is 200", async () => {
    await expect(invoke({ stripe: { failed: 1 } })).rejects.toThrow("provider failures");
  });
  it("fails when the gateway configuration is invalid", async () => {
    await expect(invoke({ stripe: { configurationError: true } })).rejects.toThrow("provider failures");
  });
  it("fails on other payment inquiry failures", async () => {
    await expect(invoke({ paymentFailures: 1 })).rejects.toThrow("provider failures");
  });
  it("fails on rejected authorization", async () => {
    await expect(invoke({}, 401)).rejects.toThrow("HTTP 401");
  });
  it("fails on uncertain email delivery", async () => {
    await expect(invoke({ mail: { uncertain: 1 } })).rejects.toThrow("uncertain delivery");
  });
});
