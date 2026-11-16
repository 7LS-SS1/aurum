import { afterEach, describe, expect, it, vi } from "vitest";
import { wallet } from "./usdt";
const input = {
  id: "45ef5f69-2fe9-4db0-8180-a93c0fe4f781",
  name: "A",
  address: "0x" + "1".repeat(40),
  active: true,
};
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("wallet pricing", () => {
  it("returns validation errors for malformed and zero addresses without throwing", () => {
    for (const address of ["TExample", "0xabcxyz", "0x" + "0".repeat(40)]) {
      expect(
        wallet.safeParse({ ...input, address, rate: "", automaticRate: true })
          .success,
      ).toBe(false);
    }
  });
  it("keeps legacy rates manual and permits an empty rate only in automatic mode", () => {
    expect(wallet.parse({ ...input, rate: "33" }).automaticRate).toBe(false);
    expect(wallet.safeParse({ ...input, rate: "" }).success).toBe(false);
    expect(
      wallet.safeParse({ ...input, rate: "", automaticRate: true }).success,
    ).toBe(true);
  });
  it("shares fresh quotes, refreshes after 15s and rejects stale prices on outage", async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const { marketPrice } = await import("./usdt-market");
    const feed = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json([{ symbol: "USDT_THB", last: "33.45" }]),
      )
      .mockResolvedValueOnce(
        Response.json([{ symbol: "USDT_THB", last: "33.46" }]),
      )
      .mockRejectedValueOnce(Error());
    vi.stubGlobal("fetch", feed);
    const [a, b] = await Promise.all([marketPrice(), marketPrice()]);
    expect(a).toEqual(b);
    expect(feed).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(15000);
    expect((await marketPrice()).rate).toBe("33.46");
    vi.advanceTimersByTime(15000);
    await expect(marketPrice()).rejects.toThrow("usdt_rate_unavailable");
  });
});
