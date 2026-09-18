import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  siteFindUnique: vi.fn(), siteFindMany: vi.fn(), distributions: vi.fn(), groupBy: vi.fn(), jobs: vi.fn(), start: vi.fn(),
  transaction: vi.fn(), lock: vi.fn(), movie: vi.fn(), rows: vi.fn(), update: vi.fn(), invalidate: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {
  targetSite: { findUnique: mocks.siteFindUnique, findMany: mocks.siteFindMany },
  distribution: { findMany: mocks.distributions, groupBy: mocks.groupBy },
  siteSyncJob: { findMany: mocks.jobs }, $transaction: mocks.transaction,
} }));
vi.mock("./job-service", () => ({ ACTIVE_JOB_STATUSES: ["QUEUED", "SCANNING", "PROCESSING"], startSyncJob: mocks.start, toPublicJob: (job: unknown) => job }));
vi.mock("@/lib/cache", () => ({ invalidatePublicMovieCaches: mocks.invalidate }));

import { getRepairOverview, startRepairJobs, refreshRepairedMovieStatus, REPAIR_STATUSES, MAX_REPAIR_MOVIES } from "./repair-service";
const actor = { id: "manager", role: "MANAGER" as const };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.siteFindUnique.mockResolvedValue({ isActive: true });
  mocks.distributions.mockResolvedValue([{ movieId: "m1" }]);
  mocks.start.mockResolvedValue({ created: true, job: { id: "j1" } });
  mocks.transaction.mockImplementation(callback => callback({ $executeRaw: mocks.lock, movie: { findUnique: mocks.movie, updateMany: mocks.update }, distribution: { findMany: mocks.rows } }));
  mocks.movie.mockResolvedValue({ status: "FAILED", targetSiteIds: ["a", "b"] });
  mocks.update.mockResolvedValue({ count: 1 });
});

describe("repair queue", () => {
  it("snapshots only failed, publishable distributions and deduplicates sites without changing existing rows", async () => {
    const results = await startRepairJobs(["a", "a"], actor, "video_only");
    expect(results).toHaveLength(1);
    expect(mocks.distributions).toHaveBeenCalledWith({ where: { siteId: "a", status: "FAILED", movie: { status: { in: REPAIR_STATUSES } } }, select: { movieId: true }, orderBy: { updatedAt: "asc" }, take: MAX_REPAIR_MOVIES });
    expect(mocks.start).toHaveBeenCalledWith("a", actor, { repair: true, mode: "video_only", pushQueue: ["m1"] });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("reports per-site errors without hiding successful starts", async () => {
    mocks.siteFindUnique.mockResolvedValueOnce({ isActive: false }).mockResolvedValueOnce({ isActive: true });
    const results = await startRepairJobs(["off", "on"], actor, "overwrite_editorial");
    expect(results[0]).toMatchObject({ error: "site_inactive", created: false });
    expect(results[1]).toMatchObject({ created: true, queued: 1 });
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });
  it("reports an active site job without pretending repair work was queued", async () => {
    mocks.start.mockResolvedValue({ created: false, job: { id: "existing" } });
    expect((await startRepairJobs(["a"], actor, "video_only"))[0]).toMatchObject({ created: false, queued: 0, error: "site_job_already_active" });
  });
  it("does not create an empty repair", async () => {
    mocks.distributions.mockResolvedValue([]);
    expect((await startRepairJobs(["a"], actor, "video_only"))[0]).toMatchObject({ queued: 0, job: null, error: null });
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it("does not leak database messages into per-site results", async () => {
    mocks.siteFindUnique.mockRejectedValue(new Error("private connection credential"));
    expect((await startRepairJobs(["a"], actor, "video_only"))[0]?.error).toBe("repair_start_failed");
  });
  it("preview only reads counts and active jobs", async () => {
    mocks.siteFindMany.mockResolvedValue([{ id: "a", name: "A", isActive: true }]);
    mocks.groupBy.mockResolvedValueOnce([{ siteId: "a", _count: { _all: 3 } }]).mockResolvedValueOnce([{ siteId: "a", _count: { _all: 2 } }]);
    mocks.jobs.mockResolvedValue([]);
    expect((await getRepairOverview()).sites[0]).toMatchObject({ failed: 3, eligible: 2, job: null });
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("movie aggregate after repair", () => {
  it("marks DONE only when every destination succeeded", async () => {
    mocks.rows.mockResolvedValue([{ siteId: "a", status: "SUCCESS" }, { siteId: "b", status: "SUCCESS" }]);
    await refreshRepairedMovieStatus("m1");
    expect(mocks.lock).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "DONE" } }));
    expect(mocks.invalidate).toHaveBeenCalledOnce();
  });
  it("keeps PARTIAL while another site remains failed", async () => {
    mocks.rows.mockResolvedValue([{ siteId: "a", status: "SUCCESS" }, { siteId: "b", status: "FAILED" }]);
    await refreshRepairedMovieStatus("m1");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "PARTIAL" } }));
  });
  it("does not mark DONE when an intended destination is missing", async () => {
    mocks.rows.mockResolvedValue([{ siteId: "a", status: "SUCCESS" }]);
    await refreshRepairedMovieStatus("m1");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "PARTIAL" } }));
  });
  it("leaves in-flight movie status alone", async () => {
    mocks.rows.mockResolvedValue([{ siteId: "a", status: "PROCESSING" }]);
    await refreshRepairedMovieStatus("m1");
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("cannot resurrect an archived movie", async () => {
    mocks.movie.mockResolvedValue({ status: "ARCHIVED" });
    await refreshRepairedMovieStatus("m1");
    expect(mocks.rows).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
