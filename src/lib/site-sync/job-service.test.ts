import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const siteSyncJobCreate = vi.fn();
const siteSyncJobFindFirst = vi.fn();
const siteSyncJobFindMany = vi.fn();
const siteSyncJobFindUnique = vi.fn();
const siteSyncJobUpdate = vi.fn();
const siteSyncJobLogFindMany = vi.fn();
const targetSiteFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    siteSyncJob: {
      create: siteSyncJobCreate,
      findFirst: siteSyncJobFindFirst,
      findMany: siteSyncJobFindMany,
      findUnique: siteSyncJobFindUnique,
      update: siteSyncJobUpdate,
    },
    siteSyncJobLog: { findMany: siteSyncJobLogFindMany },
    targetSite: { findMany: targetSiteFindMany },
  },
}));

const { startSyncJob, startSyncJobsBatch, cancelJob, retryJob, ACTIVE_JOB_STATUSES } = await import("./job-service");

function p2002() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "6.19.3" });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("startSyncJob", () => {
  it("creates a new job with activeSiteId set to the site id", async () => {
    siteSyncJobCreate.mockResolvedValue({ id: "job-1", siteId: "site-1", status: "QUEUED" });

    const result = await startSyncJob("site-1", { id: "user-1", role: "MANAGER" });

    expect(result).toEqual({ created: true, job: { id: "job-1", siteId: "site-1", status: "QUEUED" } });
    expect(siteSyncJobCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ siteId: "site-1", activeSiteId: "site-1", status: "QUEUED" }) }),
    );
  });

  it("returns the existing active job instead of creating a duplicate when the unique constraint fires", async () => {
    siteSyncJobCreate.mockRejectedValue(p2002());
    siteSyncJobFindFirst.mockResolvedValue({ id: "job-existing", siteId: "site-1", status: "PROCESSING" });

    const result = await startSyncJob("site-1", { id: "user-1", role: "MANAGER" });

    expect(result).toEqual({ created: false, job: { id: "job-existing", siteId: "site-1", status: "PROCESSING" } });
    expect(siteSyncJobFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { siteId: "site-1", status: { in: ACTIVE_JOB_STATUSES } } }),
    );
  });

  it("re-throws non-conflict errors instead of swallowing them", async () => {
    siteSyncJobCreate.mockRejectedValue(new Error("db down"));
    await expect(startSyncJob("site-1", { id: "user-1", role: "MANAGER" })).rejects.toThrow("db down");
  });
});

describe("startSyncJobsBatch", () => {
  it("starts one independent job per site", async () => {
    targetSiteFindMany.mockResolvedValue([
      { id: "site-1", name: "Site One", isActive: true },
      { id: "site-2", name: "Site Two", isActive: true },
    ]);
    siteSyncJobCreate.mockResolvedValueOnce({ id: "job-1", siteId: "site-1" }).mockResolvedValueOnce({ id: "job-2", siteId: "site-2" });

    const results = await startSyncJobsBatch(["site-1", "site-2"], { id: "user-1", role: "MANAGER" });

    expect(results).toEqual([
      { siteId: "site-1", siteName: "Site One", created: true, job: { id: "job-1", siteId: "site-1" } },
      { siteId: "site-2", siteName: "Site Two", created: true, job: { id: "job-2", siteId: "site-2" } },
    ]);
  });

  it("one site being inactive doesn't block the others from starting", async () => {
    targetSiteFindMany.mockResolvedValue([
      { id: "site-1", name: "Site One", isActive: true },
      { id: "site-2", name: "Site Two", isActive: false },
    ]);
    siteSyncJobCreate.mockResolvedValueOnce({ id: "job-1", siteId: "site-1" });

    await expect(startSyncJobsBatch(["site-1", "site-2"], { id: "user-1", role: "MANAGER" })).rejects.toThrow("site_inactive:site-2");
  });
});

describe("cancelJob", () => {
  it("cancels an active job and releases its lock/active-slot", async () => {
    siteSyncJobFindUnique.mockResolvedValue({ id: "job-1", siteId: "site-1", status: "PROCESSING" });
    siteSyncJobUpdate.mockResolvedValue({ id: "job-1", status: "CANCELLED" });

    const result = await cancelJob("job-1");

    expect(siteSyncJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CANCELLED", activeSiteId: null, lockedUntil: null }) }),
    );
    expect(result.status).toBe("CANCELLED");
  });

  it("refuses to cancel a job that already finished", async () => {
    siteSyncJobFindUnique.mockResolvedValue({ id: "job-1", siteId: "site-1", status: "COMPLETED" });
    await expect(cancelJob("job-1")).rejects.toThrow("job_not_active");
  });
});

describe("retryJob", () => {
  it("starts a brand-new job for the same site rather than resuming the failed one", async () => {
    siteSyncJobFindUnique.mockResolvedValue({ id: "job-old", siteId: "site-1", status: "FAILED" });
    siteSyncJobCreate.mockResolvedValue({ id: "job-new", siteId: "site-1", status: "QUEUED" });

    const result = await retryJob("job-old", { id: "user-1", role: "MANAGER" });

    expect(result.created).toBe(true);
    expect(result.job.id).toBe("job-new");
  });

  it("refuses to retry a job that isn't FAILED", async () => {
    siteSyncJobFindUnique.mockResolvedValue({ id: "job-1", siteId: "site-1", status: "COMPLETED" });
    await expect(retryJob("job-1", { id: "user-1", role: "MANAGER" })).rejects.toThrow("job_not_failed");
  });
});
