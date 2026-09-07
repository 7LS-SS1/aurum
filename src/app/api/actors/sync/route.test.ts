import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rate: vi.fn(), sync: vi.fn() }));
vi.mock("@/lib/authz", () => ({ requireMinRole: mocks.auth }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rate }));
vi.mock("@/lib/actor-sync", () => ({ syncActorToSite: mocks.sync }));
import { POST } from "./route";
import { ApiError } from "@/lib/api-response";
const actor1 = "cm00000000000000000000001", actor2 = "cm00000000000000000000002", siteId = "cm00000000000000000000003";
const request = (actorIds = [actor1]) => new Request("http://localhost/api/actors/sync", { method: "POST", body: JSON.stringify({ siteId, actorIds }) });
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => { vi.stubEnv("ACTOR_SYNC_ENABLED", "true"); vi.clearAllMocks(); mocks.auth.mockResolvedValue({ id: "user", role: "MANAGER" }); mocks.rate.mockResolvedValue({ success: true }); });
describe("actor sync route", () => {
  it("honors the optional deployment kill switch", async () => {
    vi.stubEnv("ACTOR_SYNC_ENABLED", "false");
    expect((await POST(request())).status).toBe(503);
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it.each(["STAFF", "SENIOR", "SYSTEM"])("denies %s using the shared actor:push policy", async role => {
    mocks.auth.mockResolvedValue({ id: "user", role });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(mocks.rate).not.toHaveBeenCalled();
  });
  it.each(["MANAGER", "HEAD"])("allows approved %s without an enable flag", async role => {
    vi.stubEnv("ACTOR_SYNC_ENABLED", undefined);
    mocks.auth.mockResolvedValue({ id: "user", role });
    mocks.sync.mockResolvedValue({ actorId: actor1, status: "skipped" });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledOnce();
  });
  it.each([401, 403])("rejects unauthorized requests before any work (%s)", async status => {
    mocks.auth.mockRejectedValue(new ApiError("forbidden", status));
    expect((await POST(request())).status).toBe(status);
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(mocks.rate).not.toHaveBeenCalled();
  });
  it("deduplicates IDs and returns failures independently", async () => {
    mocks.sync.mockResolvedValueOnce({ actorId: actor1, status: "created" }).mockRejectedValueOnce(new Error("private database details"));
    const res = await POST(request([actor1, actor1, actor2]));
    const body = await res.json();
    expect(body.results.map((r: { status: string }) => r.status)).toEqual(["created", "failed"]);
    expect(mocks.sync).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(body)).not.toContain("private database details");
  });
  it("rejects oversized batches", async () => {
    expect((await POST(request(Array(6).fill(actor1)))).status).toBe(422);
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("rate-limits before contacting a destination", async () => {
    mocks.rate.mockResolvedValue({ success: false });
    expect((await POST(request())).status).toBe(429);
    expect(mocks.sync).not.toHaveBeenCalled();
  });
});
