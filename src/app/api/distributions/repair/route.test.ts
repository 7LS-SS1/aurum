import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ApiError } from "@/lib/api-response";
const mocks = vi.hoisted(() => ({ role: vi.fn(), rate: vi.fn(), overview: vi.fn(), start: vi.fn(), audit: vi.fn(), trigger: vi.fn() }));
vi.mock("@/lib/authz", () => ({ requireMinRole: mocks.role }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rate }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("@/lib/env", () => ({ env: () => ({ SYSTEM_API_KEY: "fixture-key" }) }));
vi.mock("@/lib/site-sync/repair-service", () => ({ getRepairOverview: mocks.overview, startRepairJobs: mocks.start }));
vi.mock("@/lib/site-sync/job-runner", () => ({ triggerWorkerBestEffort: mocks.trigger }));
import { GET, POST } from "./route";
const request = (body: unknown) => new NextRequest("http://localhost/api/distributions/repair", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
beforeEach(() => { vi.resetAllMocks(); mocks.role.mockResolvedValue({ id: "manager", role: "MANAGER" }); mocks.rate.mockResolvedValue({ success: true }); mocks.start.mockResolvedValue([{ siteId: "a", created: true, queued: 1 }]); });
describe("repair API", () => {
  it("rejects unauthorized users before reading or queuing jobs", async () => {
    mocks.role.mockRejectedValue(new ApiError("forbidden", 403));
    expect((await GET()).status).toBe(403);
    expect((await POST(request({ siteIds: ["a"] }))).status).toBe(403);
    expect(mocks.overview).not.toHaveBeenCalled(); expect(mocks.start).not.toHaveBeenCalled();
  });
  it("defaults to preserving editorial content and kicks durable worker after queuing", async () => {
    expect((await POST(request({ siteIds: ["a"] }))).status).toBe(202);
    expect(mocks.role).toHaveBeenCalledWith("MANAGER");
    expect(mocks.start).toHaveBeenCalledWith(["a"], { id: "manager", role: "MANAGER" }, "video_only");
    expect(mocks.trigger).toHaveBeenCalledWith("http://localhost", "fixture-key");
    expect(mocks.audit).toHaveBeenCalledOnce();
  });
  it("requires a valid explicit mode and a bounded, nonempty site selection", async () => {
    for (const body of [{ siteIds: [] }, { siteIds: ["a"], mode: "unrecognized" }, { siteIds: Array(51).fill("a") }]) expect((await POST(request(body))).status).toBe(422);
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it("rate limits repair starts before creating jobs", async () => {
    mocks.rate.mockResolvedValue({ success: false });
    expect((await POST(request({ siteIds: ["a"] }))).status).toBe(429);
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it("does not trigger a worker when no new job was created", async () => {
    mocks.start.mockResolvedValue([{ siteId: "a", created: false, queued: 0 }]);
    expect((await POST(request({ siteIds: ["a"] }))).status).toBe(202);
    expect(mocks.trigger).not.toHaveBeenCalled();
  });
});
