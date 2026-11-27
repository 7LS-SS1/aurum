import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/lib/source-scanner/worker", () => ({ runScanner: mocks.run }));
vi.mock("@/lib/service-worker-secret", () => ({ serviceWorkerSecret: () => "x".repeat(40) }));
import { POST } from "./route";
describe("internal source scanner", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it("rejects missing and incorrect secrets before work", async () => {
    for (const authorization of ["", "Bearer wrong", `Bearer ${"y".repeat(40)}`]) {
      expect((await POST(new Request("https://app.test/api/internal/source-scanner", { method: "POST", headers: { authorization } }))).status).toBe(401);
    }
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("accepts the service worker secret and uses the bounded budget", async () => {
    mocks.run.mockResolvedValue({ processed: 0, results: [] });
    const response = await POST(new Request("https://app.test/api/internal/source-scanner", { method: "POST", headers: { authorization: `Bearer ${"x".repeat(40)}` } }));
    expect(response.status).toBe(200); expect(mocks.run).toHaveBeenCalledWith(270000);
  });
});
