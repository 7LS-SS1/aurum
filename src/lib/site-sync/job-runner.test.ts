import { describe, it, expect, vi, beforeEach } from "vitest";

const siteSyncJobFindMany = vi.fn();
const siteSyncJobUpdateMany = vi.fn();
const siteSyncJobFindUnique = vi.fn();
const siteSyncJobUpdate = vi.fn();
const siteSyncJobLogCreate = vi.fn();
const movieFindMany = vi.fn();
const distributionFindMany = vi.fn();
const distributionUpsert = vi.fn();
const movieSiteDraftFindMany = vi.fn();
const decryptMock = vi.fn();
const listAllPostsMock = vi.fn();
const updatePostMetaMock = vi.fn();
const distributeToSiteMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    siteSyncJob: { findMany: siteSyncJobFindMany, updateMany: siteSyncJobUpdateMany, findUnique: siteSyncJobFindUnique, update: siteSyncJobUpdate },
    siteSyncJobLog: { create: siteSyncJobLogCreate },
    movie: { findMany: movieFindMany },
    distribution: { findMany: distributionFindMany, upsert: distributionUpsert },
    movieSiteDraft: { findMany: movieSiteDraftFindMany },
  },
}));

vi.mock("@/lib/crypto", () => ({ decrypt: decryptMock }));

class FakeWordPressScanError extends Error {}
vi.mock("@/lib/wordpress-client", () => ({
  WordPressClient: vi.fn().mockImplementation(() => ({
    listAllPosts: listAllPostsMock,
    updatePostMeta: updatePostMetaMock,
  })),
  WordPressScanError: FakeWordPressScanError,
}));

vi.mock("@/lib/distributor", () => ({ distributeToSite: distributeToSiteMock }));

const { runScanAndCompare, runPushBatch, runWorkerTick } = await import("./job-runner");

function fakeSite(overrides: Record<string, unknown> = {}) {
  return {
    id: "site-1",
    name: "Site One",
    baseUrl: "https://wp.example.com",
    authType: "APP_PASSWORD",
    wpUsername: "admin",
    credentialEnc: "enc",
    credentialIv: "iv",
    credentialTag: "tag",
    postType: "posts",
    categoryRestBase: "categories",
    tagRestBase: "tags",
    ...overrides,
  };
}

// Loosely typed on purpose (mirrors the `as never` pattern in distributor.test.ts) — these
// mocks only carry the fields job-runner.ts actually reads, not every Prisma column.
function fakeJob(overrides: Record<string, unknown> = {}): never {
  return {
    id: "job-1",
    siteId: "site-1",
    status: "SCANNING",
    phase: "scanning",
    progress: 0,
    startedAt: null,
    totalMovies: 0,
    scannedMovies: 0,
    matchedMovies: 0,
    skippedMovies: 0,
    queuedMovies: 0,
    processedMovies: 0,
    successCount: 0,
    failedCount: 0,
    cursor: {},
    site: fakeSite(),
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  decryptMock.mockReturnValue("decrypted-credential");
  siteSyncJobUpdate.mockResolvedValue({});
  siteSyncJobLogCreate.mockResolvedValue({});
  distributionUpsert.mockResolvedValue({});
});

describe("runScanAndCompare", () => {
  it("never touches the movie table or pushes anything when the WordPress scan itself fails", async () => {
    listAllPostsMock.mockRejectedValue(new FakeWordPressScanError("timeout"));

    await expect(runScanAndCompare(fakeJob())).rejects.toThrow(/scan_failed/);

    expect(movieFindMany).not.toHaveBeenCalled();
    expect(distributionUpsert).not.toHaveBeenCalled();
  });

  it("reconciles a movie found on WordPress as SUCCESS instead of queuing it for push", async () => {
    listAllPostsMock.mockResolvedValue([
      { id: 99, link: "https://wp.example.com/?p=99", slug: "old-slug", title: "Old Title", status: "publish", aurumMovieId: "m1", jwPlayerMediaId: null, videoUrl: null },
    ]);
    movieFindMany.mockResolvedValue([{ id: "m1", slug: "old-slug", title: "Old Title", videoUrl: null, jwPlayerMediaId: null }]);
    distributionFindMany.mockResolvedValue([]);

    await runScanAndCompare(fakeJob());

    expect(distributionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { movieId_siteId: { movieId: "m1", siteId: "site-1" } },
        update: expect.objectContaining({ status: "SUCCESS", remotePostId: "99" }),
      }),
    );
    // aurum_movie_id already matched — no need to backfill the meta field again.
    expect(updatePostMetaMock).not.toHaveBeenCalled();

    const finalUpdate = siteSyncJobUpdate.mock.calls.find((c) => c[0].data.status === "COMPLETED");
    expect(finalUpdate?.[0].data).toEqual(expect.objectContaining({ progress: 100, queuedMovies: 0, matchedMovies: 1, skippedMovies: 1 }));
  });

  it("backfills aurum_movie_id when a legacy post is matched by a weaker strategy", async () => {
    listAllPostsMock.mockResolvedValue([
      { id: 5, link: "https://wp.example.com/?p=5", slug: "m-slug", title: "M Title", status: "publish", aurumMovieId: null, jwPlayerMediaId: "jw-1", videoUrl: null },
    ]);
    movieFindMany.mockResolvedValue([{ id: "m1", slug: "m-slug", title: "M Title", videoUrl: null, jwPlayerMediaId: "jw-1" }]);
    distributionFindMany.mockResolvedValue([]);
    updatePostMetaMock.mockResolvedValue(undefined);

    await runScanAndCompare(fakeJob());

    expect(updatePostMetaMock).toHaveBeenCalledWith(5, { aurum_movie_id: "m1" });
  });

  it("queues a movie for push when no WordPress post matches and no local SUCCESS distribution exists", async () => {
    listAllPostsMock.mockResolvedValue([]);
    movieFindMany.mockResolvedValue([{ id: "m1", slug: "s", title: "T", videoUrl: null, jwPlayerMediaId: null }]);
    distributionFindMany.mockResolvedValue([]);

    await runScanAndCompare(fakeJob());

    const pushingUpdate = siteSyncJobUpdate.mock.calls.find((c) => c[0].data.phase === "pushing");
    expect(pushingUpdate?.[0].data).toEqual(expect.objectContaining({ status: "PROCESSING", progress: 30, queuedMovies: 1, cursor: { pushQueue: ["m1"] } }));
  });

  it("skips (without pushing) a movie AURUM marks SUCCESS locally but that has no matching remote post — avoids creating a duplicate", async () => {
    listAllPostsMock.mockResolvedValue([]);
    movieFindMany.mockResolvedValue([{ id: "m1", slug: "s", title: "T", videoUrl: null, jwPlayerMediaId: null }]);
    distributionFindMany.mockResolvedValue([{ movieId: "m1", status: "SUCCESS", remotePostId: "123" }]);

    await runScanAndCompare(fakeJob());

    const completedUpdate = siteSyncJobUpdate.mock.calls.find((c) => c[0].data.status === "COMPLETED");
    expect(completedUpdate?.[0].data.queuedMovies).toBe(0);
    expect(completedUpdate?.[0].data.skippedMovies).toBe(1);
    expect(
      siteSyncJobLogCreate.mock.calls.some((c) => c[0].data.event === "local_success_no_remote_match"),
    ).toBe(true);
  });
});

describe("runPushBatch", () => {
  it("calls distributeToSite for each queued movie in the batch and reports monotonically increasing, capped progress when more remain", async () => {
    // 10 queued total, only PUSH_BATCH_SIZE (6) are taken this tick — 4 remain, so the job isn't done yet.
    const ids = Array.from({ length: 10 }, (_, i) => `m${i + 1}`);
    movieFindMany.mockResolvedValue(ids.slice(0, 6).map((id) => ({ id, title: `Movie ${id}` })));
    movieSiteDraftFindMany.mockResolvedValue([]);
    distributionFindMany.mockResolvedValue([]);
    distributeToSiteMock.mockResolvedValue({ status: "success", postId: 1, url: "https://x/1" });

    await runPushBatch(fakeJob({ phase: "pushing", queuedMovies: 10, processedMovies: 0, cursor: { pushQueue: ids } }));

    expect(distributeToSiteMock).toHaveBeenCalledTimes(6);
    const update = siteSyncJobUpdate.mock.calls[0]?.[0].data;
    expect(update.processedMovies).toBe(6);
    expect(update.successCount).toBe(6);
    expect(update.progress).toBeGreaterThan(30);
    expect(update.progress).toBeLessThan(100);
    expect(update.cursor.pushQueue).toEqual(ids.slice(6));
  });

  it("finishes at exactly 100% and COMPLETED when the last batch item is processed with no failures", async () => {
    movieFindMany.mockResolvedValue([{ id: "m1", title: "Movie 1" }]);
    movieSiteDraftFindMany.mockResolvedValue([]);
    distributionFindMany.mockResolvedValue([]);
    distributeToSiteMock.mockResolvedValue({ status: "success", postId: 1, url: "https://x/1" });

    await runPushBatch(fakeJob({ phase: "pushing", queuedMovies: 1, processedMovies: 0, cursor: { pushQueue: ["m1"] } }));

    const update = siteSyncJobUpdate.mock.calls[0]?.[0].data;
    expect(update).toEqual(expect.objectContaining({ status: "COMPLETED", phase: "completed", progress: 100 }));
  });

  it("finishes PARTIAL when at least one movie in the final batch failed", async () => {
    movieFindMany.mockResolvedValue([{ id: "m1", title: "Movie 1" }]);
    movieSiteDraftFindMany.mockResolvedValue([]);
    distributionFindMany.mockResolvedValue([]);
    distributeToSiteMock.mockResolvedValue({ status: "failed", error: "wp down" });

    await runPushBatch(fakeJob({ phase: "pushing", queuedMovies: 1, processedMovies: 0, cursor: { pushQueue: ["m1"] } }));

    const update = siteSyncJobUpdate.mock.calls[0]?.[0].data;
    expect(update).toEqual(expect.objectContaining({ status: "PARTIAL", phase: "partial", progress: 100, failedCount: 1 }));
  });

  it("never calls distributeToSite again for a movie a previous (possibly crashed) tick already marked SUCCESS", async () => {
    movieFindMany.mockResolvedValue([{ id: "m1", title: "Movie 1" }]);
    movieSiteDraftFindMany.mockResolvedValue([]);
    distributionFindMany.mockResolvedValue([{ movieId: "m1", status: "SUCCESS", remotePostId: "777", remotePostUrl: "https://x/777" }]);

    await runPushBatch(fakeJob({ phase: "pushing", queuedMovies: 1, processedMovies: 0, cursor: { pushQueue: ["m1"] } }));

    expect(distributeToSiteMock).not.toHaveBeenCalled();
    const update = siteSyncJobUpdate.mock.calls[0]?.[0].data;
    expect(update.successCount).toBe(1); // still counted as a success, just without re-posting
  });

  it("completes immediately (COMPLETED, 100%) when the push queue is already empty", async () => {
    await runPushBatch(fakeJob({ phase: "pushing", queuedMovies: 0, processedMovies: 0, failedCount: 0, cursor: { pushQueue: [] } }));
    expect(distributeToSiteMock).not.toHaveBeenCalled();
    expect(siteSyncJobUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "COMPLETED", progress: 100 }) }));
  });
});

describe("runWorkerTick claim/lock", () => {
  it("does not process the same job twice when a second tick's claim update reports 0 rows affected", async () => {
    siteSyncJobFindMany.mockResolvedValue([{ id: "job-1" }]);
    siteSyncJobUpdateMany
      .mockResolvedValueOnce({ count: 1 }) // tick 1: claim succeeds
      .mockResolvedValueOnce({ count: 0 }) // tick 1: release (already finalized elsewhere, harmless)
      .mockResolvedValueOnce({ count: 0 }); // tick 2: claim fails — someone else already has it / it's finalized
    siteSyncJobFindUnique.mockResolvedValueOnce(fakeJob({ phase: "pushing", queuedMovies: 0, cursor: { pushQueue: [] } }));

    const tick1 = await runWorkerTick("worker-A");
    expect(tick1.claimed).toBe(1);
    expect(siteSyncJobFindUnique).toHaveBeenCalledTimes(1);

    const tick2 = await runWorkerTick("worker-B");
    expect(tick2.claimed).toBe(0);
    expect(siteSyncJobFindUnique).toHaveBeenCalledTimes(1); // never fetched/processed a second time
  });

  it("marks the job FAILED and never rethrows out of runWorkerTick when processing throws unexpectedly", async () => {
    siteSyncJobFindMany.mockResolvedValue([{ id: "job-1" }]);
    siteSyncJobUpdateMany.mockResolvedValue({ count: 1 });
    siteSyncJobFindUnique.mockResolvedValueOnce(fakeJob({ phase: "scanning" }));
    listAllPostsMock.mockRejectedValue(new Error("boom"));

    const tick = await runWorkerTick("worker-A");

    expect(tick.claimed).toBe(1);
    expect(siteSyncJobUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }));
  });
});
