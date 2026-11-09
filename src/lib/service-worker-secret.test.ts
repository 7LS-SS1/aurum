import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { serviceWorkerSecret } from "./service-worker-secret";
const dirs: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true }); });
describe("worker secret file", () => {
  it("reads an absolute secret file and trims the trailing newline", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "aurum-secret-test-")); dirs.push(dir);
    const file = path.join(dir, "secret"); writeFileSync(file, "a".repeat(64) + "\n");
    vi.stubEnv("SERVICE_WORKER_SECRET", ""); vi.stubEnv("SERVICE_WORKER_SECRET_FILE", file);
    expect(serviceWorkerSecret()).toBe("a".repeat(64));
  });
  it("fails closed for relative and unavailable paths", () => {
    vi.stubEnv("SERVICE_WORKER_SECRET", ""); vi.stubEnv("SERVICE_WORKER_SECRET_FILE", "missing-file");
    expect(serviceWorkerSecret()).toBe("");
    vi.stubEnv("SERVICE_WORKER_SECRET_FILE", path.join(os.tmpdir(), "missing-aurum-worker-secret"));
    expect(serviceWorkerSecret()).toBe("");
  });
  it("keeps explicit environment secrets compatible", () => {
    vi.stubEnv("SERVICE_WORKER_SECRET", "b".repeat(64)); vi.stubEnv("SERVICE_WORKER_SECRET_FILE", "invalid");
    expect(serviceWorkerSecret()).toBe("b".repeat(64));
  });
});
