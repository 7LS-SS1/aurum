import { describe, it, expect, vi, beforeEach } from "vitest";

const movieFindMany = vi.fn();
const distributionCreateMany = vi.fn();
const distributionFindMany = vi.fn();
const movieSiteDraftFindUnique = vi.fn();
const distributeToSiteMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    movie: { findMany: movieFindMany },
    distribution: { createMany: distributionCreateMany, findMany: distributionFindMany },
    movieSiteDraft: { findUnique: movieSiteDraftFindUnique },
  },
}));

vi.mock("@/lib/distributor", () => ({
  distributeToSite: distributeToSiteMock,
}));

const { createBackfillJobs, processPendingDistributions, ELIGIBLE_BACKFILL_STATUSES } = await import("./site-backfill");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ELIGIBLE_BACKFILL_STATUSES", () => {
  it("only includes approved/published states, never draft/archived/rejected/failed", () => {
    expect(ELIGIBLE_BACKFILL_STATUSES).toEqual(["APPROVED", "DONE", "PARTIAL"]);
    expect(ELIGIBLE_BACKFILL_STATUSES).not.toContain("DRAFT");
    expect(ELIGIBLE_BACKFILL_STATUSES).not.toContain("ARCHIVED");
    expect(ELIGIBLE_BACKFILL_STATUSES).not.toContain("REJECTED");
    expect(ELIGIBLE_BACKFILL_STATUSES).not.toContain("FAILED");
  });
});

describe("createBackfillJobs", () => {
  it("only queries movies in the eligible statuses", async () => {
    movieFindMany.mockResolvedValue([{ id: "m1" }, { id: "m2" }]);
    distributionCreateMany.mockResolvedValue({ count: 2 });

    await createBackfillJobs("site-1");

    expect(movieFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: { in: ["APPROVED", "DONE", "PARTIAL"] } } }),
    );
  });

  it("scopes every created row to the target site only", async () => {
    movieFindMany.mockResolvedValue([{ id: "m1" }, { id: "m2" }]);
    distributionCreateMany.mockResolvedValue({ count: 2 });

    await createBackfillJobs("site-42");

    const call = distributionCreateMany.mock.calls[0]?.[0];
    expect(call?.data).toEqual([
      { movieId: "m1", siteId: "site-42", status: "PENDING" },
      { movieId: "m2", siteId: "site-42", status: "PENDING" },
    ]);
  });

  it("is idempotent — uses skipDuplicates so re-running never creates duplicate jobs", async () => {
    movieFindMany.mockResolvedValue([{ id: "m1" }, { id: "m2" }]);
    distributionCreateMany.mockResolvedValue({ count: 0 }); // both already exist for this site

    const result = await createBackfillJobs("site-1");

    expect(distributionCreateMany.mock.calls[0]?.[0]?.skipDuplicates).toBe(true);
    expect(result).toEqual({ eligible: 2, created: 0, skipped: 2 });
  });

  it("reports created vs skipped counts correctly on a partial match", async () => {
    movieFindMany.mockResolvedValue([{ id: "m1" }, { id: "m2" }, { id: "m3" }]);
    distributionCreateMany.mockResolvedValue({ count: 1 }); // 1 new, 2 already existed

    const result = await createBackfillJobs("site-1");

    expect(result).toEqual({ eligible: 3, created: 1, skipped: 2 });
  });

  it("skips the createMany call entirely when there is nothing eligible", async () => {
    movieFindMany.mockResolvedValue([]);

    const result = await createBackfillJobs("site-1");

    expect(distributionCreateMany).not.toHaveBeenCalled();
    expect(result).toEqual({ eligible: 0, created: 0, skipped: 0 });
  });
});

describe("processPendingDistributions", () => {
  it("only processes rows with status PENDING, respecting the batch limit", async () => {
    distributionFindMany.mockResolvedValue([]);

    await processPendingDistributions(30);

    expect(distributionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "PENDING" }, take: 30 }),
    );
  });

  it("delegates each row to distributeToSite (not distributeMovie) so Movie.status is never touched", async () => {
    const movie = { id: "m1" };
    const site = { id: "s1" };
    distributionFindMany.mockResolvedValue([{ movieId: "m1", siteId: "s1", movie, site }]);
    movieSiteDraftFindUnique.mockResolvedValue(null);
    distributeToSiteMock.mockResolvedValue({ status: "success" });

    const result = await processPendingDistributions(30);

    expect(distributeToSiteMock).toHaveBeenCalledWith(movie, site, undefined);
    expect(result).toEqual({ processed: 1, success: 1, failed: 0 });
  });

  it("counts failures without throwing, so one bad site config doesn't stop the batch", async () => {
    const rows = [
      { movieId: "m1", siteId: "s1", movie: { id: "m1" }, site: { id: "s1" } },
      { movieId: "m2", siteId: "s1", movie: { id: "m2" }, site: { id: "s1" } },
    ];
    distributionFindMany.mockResolvedValue(rows);
    movieSiteDraftFindUnique.mockResolvedValue(null);
    distributeToSiteMock.mockResolvedValueOnce({ status: "failed", error: "boom" }).mockResolvedValueOnce({ status: "success" });

    const result = await processPendingDistributions(30);

    expect(result).toEqual({ processed: 2, success: 1, failed: 1 });
  });
});
