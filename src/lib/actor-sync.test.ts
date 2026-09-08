import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  findActor: vi.fn(), audit: vi.fn(), query: vi.fn(), execute: vi.fn(), site: vi.fn(), sync: vi.fn(), check: vi.fn(),
}));
vi.mock("./prisma", () => {
  const tx = { actor: { findUnique: mocks.findActor }, targetSite: { findUnique: mocks.site }, $queryRaw: mocks.query, $executeRaw: mocks.execute };
  return { prisma: { ...tx, auditLog: { create: mocks.audit }, $transaction: (fn: (db: typeof tx) => unknown) => fn(tx) } };
});
vi.mock("./crypto", () => ({ decrypt: () => "private-test-credential" }));
vi.mock("./wordpress-client", async importOriginal => ({ ...await importOriginal<typeof import("./wordpress-client")>(), WordPressClient: class { syncActor = mocks.sync; checkActorSyncSupport = mocks.check; } }));
import { checkActorDestination, syncActorToSite } from "./actor-sync";
import { WordPressHttpError } from "./wordpress-client";
const actor = { id: "cactor", name: "Test", bio: null, profileImageUrl: null, age: null, heightCm: null,
 weightKg: null, measurementBust: null, measurementWaist: null, measurementHip: null };
const user = { id: "user", role: "MANAGER" as const };
beforeEach(() => {
 vi.clearAllMocks();
 mocks.findActor.mockResolvedValue(actor); mocks.audit.mockResolvedValue({});
 mocks.query.mockResolvedValue([{ locked: true, ready: true }]); mocks.execute.mockResolvedValue(1);
 mocks.site.mockResolvedValue({ isActive: true, baseUrl: "https://wp.example.test", authType: "APP_PASSWORD" });
 mocks.sync.mockResolvedValue({ remoteId: 8, status: "created" });
});
describe("actor sync orchestration", () => {
 it("checks readiness without sending actor data", async () => {
  mocks.check.mockResolvedValue(undefined);
  await checkActorDestination("site");
  expect(mocks.check).toHaveBeenCalledOnce();
  expect(mocks.sync).not.toHaveBeenCalled();
  expect(mocks.execute).not.toHaveBeenCalled();
 });
 it("fails preflight before network access when migration is missing", async () => {
  mocks.query.mockResolvedValueOnce([{ ready: false }]);
  await expect(checkActorDestination("site")).rejects.toThrow("migration");
  expect(mocks.check).not.toHaveBeenCalled();
 });
 it.each([404, 401, 403])("explains destination HTTP %s without leaking its message", async status => {
  mocks.sync.mockRejectedValueOnce(new WordPressHttpError(status, "private-test-credential"));
  const result = await syncActorToSite(actor.id, "site", user);
  expect(result.status).toBe("failed");
  expect(JSON.stringify(result)).not.toContain("private-test-credential");
  expect(result).toHaveProperty("message", expect.stringContaining(status === 404 ? "API นักแสดง" : "Application Password"));
 });
 it("explains a destination timeout", async () => {
  mocks.sync.mockRejectedValueOnce(new DOMException("private URL", "TimeoutError"));
  expect(await syncActorToSite(actor.id, "site", user)).toHaveProperty("message", expect.stringContaining("ตอบช้าเกินกำหนด"));
 });
 it("does not send remotely before the mapping migration is installed", async () => {
  mocks.query.mockResolvedValueOnce([{ locked: true }]).mockResolvedValueOnce([{ ready: false }]);
  const result = await syncActorToSite(actor.id, "site", user);
  expect(result.status).toBe("failed");
  expect(result).toHaveProperty("message", "กรุณารัน migration นักแสดงก่อนเริ่มส่ง");
  expect(mocks.sync).not.toHaveBeenCalled();
 });
 it("stores mapping only after remote verification and writes correlated audit entries", async () => {
  expect((await syncActorToSite(actor.id, "site", user)).status).toBe("created");
  expect(mocks.execute).toHaveBeenCalledOnce();
  expect(mocks.audit.mock.calls[0]?.[0].data.action).toBe("actor_sync_started");
  expect(mocks.audit.mock.calls[1]?.[0].data.action).toBe("actor_sync_finished");
  expect(mocks.audit.mock.calls[0]?.[0].data.metadata.requestId).toBe(mocks.audit.mock.calls[1]?.[0].data.metadata.requestId);
  expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("private-test-credential");
 });
 it("leaves an existing destination actor untouched in create-only mode", async () => {
  mocks.sync.mockResolvedValueOnce({ remoteId: 8, status: "existing" });
  expect((await syncActorToSite(actor.id, "site", user, { createOnly: true })).status).toBe("existing");
  expect(mocks.sync).toHaveBeenCalledWith(expect.anything(), { createOnly: true });
  expect(mocks.execute).not.toHaveBeenCalled();
 });
 it("fails closed before network I/O if the audit write fails", async () => {
  mocks.audit.mockRejectedValueOnce(new Error("db unavailable"));
  await expect(syncActorToSite(actor.id, "site", user)).rejects.toThrow();
  expect(mocks.sync).not.toHaveBeenCalled();
 });
 it("does not push when a competing process owns the site lock", async () => {
  mocks.query.mockResolvedValue([{ locked: false }]);
  expect((await syncActorToSite(actor.id, "site", user)).status).toBe("failed");
  expect(mocks.sync).not.toHaveBeenCalled();
 });
 it("does not overwrite data changed while waiting for the lock", async () => {
  mocks.findActor.mockResolvedValueOnce(actor).mockResolvedValueOnce({ ...actor, name: "Changed" });
  expect((await syncActorToSite(actor.id, "site", user)).status).toBe("failed");
  expect(mocks.sync).not.toHaveBeenCalled();
 });
 it("isolates and sanitizes remote errors without updating the mapping", async () => {
  mocks.sync.mockRejectedValueOnce(new Error("private-test-credential"));
  const result = await syncActorToSite(actor.id, "site", user);
  expect(result.status).toBe("failed");
  expect(JSON.stringify(result)).not.toContain("private-test-credential");
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(mocks.audit.mock.calls[1]?.[0].data.action).toBe("actor_sync_failed");
 });
});
