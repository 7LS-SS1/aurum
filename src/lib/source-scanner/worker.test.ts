import type { VideoSource } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  db: { videoSource: { findUnique: vi.fn() }, sourceItem: { updateMany: vi.fn(), findUnique: vi.fn() }, movie: { create: vi.fn() }, targetSite: { findMany: vi.fn() }, auditLog: { create: vi.fn() }, $transaction: vi.fn() },
  claimItem: vi.fn(), fence: vi.fn(), event: vi.fn(), ingest: vi.fn(), resolve: vi.fn(), cleanup: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("./store", () => ({ claimItem: mocks.claimItem, fence: mocks.fence, event: mocks.event }));
vi.mock("./media", () => ({ ingestMedia: mocks.ingest }));
vi.mock("./adapters", () => ({ resolveItem: mocks.resolve }));
import { processItem } from "./worker";
import { ScannerError } from "./contracts";
const source = { id: "s", control: "RUN", deletedAt: null, stopVersion: 1, mainCategory: "Demo", defaultTags: ["Source"], maxFileBytes: BigInt(1024) } as unknown as VideoSource;
describe("scanner review-only transaction", () => {
  beforeEach(() => {
    vi.resetAllMocks(); mocks.db.$transaction.mockImplementation(async (fn) => fn(mocks.db));
    mocks.db.videoSource.findUnique.mockResolvedValue(source);
    mocks.db.sourceItem.updateMany.mockResolvedValue({ count: 1 }); mocks.db.sourceItem.findUnique.mockResolvedValue({ state: "DOWNLOADING" });
    mocks.db.targetSite.findMany.mockResolvedValue([]);
    mocks.claimItem.mockResolvedValue({ id: "i", claimToken: "claim", attempts: 1, pageUrl: "https://catalog.test/v", tags: [], categories: [] });
    mocks.resolve.mockResolvedValue({ title: "Fixture", description: "Fixture description", mediaUrl: "https://cdn.test/v.mp4", coverUrl: null, tags: ["Test"], categories: ["Fixture"] });
    mocks.ingest.mockResolvedValue({ videoUrl: "https://r2.test/video", thumbnailUrl: "https://r2.test/cover", bytes: 10, durationSec: 1, cleanup: mocks.cleanup });
  });
  it("creates one Movie in READY_FOR_REVIEW and records provenance and audit", async () => {
    const result = await processItem(source, "lease", vi.fn(), new AbortController().signal);
    expect(result).toMatchObject({ status: "DONE", movieId: "scan_i" });
    expect(mocks.db.movie.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "READY_FOR_REVIEW", extraMeta: { scan: expect.objectContaining({ sourceId: "s", itemId: "i" }) } }) });
    expect(mocks.fence).toHaveBeenCalled(); expect(mocks.cleanup).not.toHaveBeenCalled();
    expect(mocks.db.auditLog.create).toHaveBeenCalledTimes(1);
  });
  it("does not start after PAUSE", async () => {
    mocks.db.videoSource.findUnique.mockResolvedValue({ ...source, control: "PAUSE" });
    expect(await processItem(source, "lease", vi.fn(), new AbortController().signal)).toBeNull(); expect(mocks.claimItem).not.toHaveBeenCalled();
  });
  it("STOP before commit prevents Movie creation and cleans the uploaded file", async () => {
    mocks.fence.mockRejectedValue(new ScannerError("STOPPED"));
    expect(await processItem(source, "lease", vi.fn(), new AbortController().signal)).toMatchObject({ status: "PENDING" });
    expect(mocks.db.movie.create).not.toHaveBeenCalled(); expect(mocks.cleanup).toHaveBeenCalled();
    expect(mocks.db.sourceItem.updateMany.mock.calls.at(-1)![0].data.attempts).toEqual({ decrement: 1 });
  });
  it("invalid media never creates Movie; third failure is terminal", async () => {
    mocks.claimItem.mockResolvedValue({ id: "i", claimToken: "claim", attempts: 3, tags: [], categories: [] });
    mocks.ingest.mockRejectedValue(new ScannerError("INVALID_MEDIA"));
    expect(await processItem(source, "lease", vi.fn(), new AbortController().signal)).toMatchObject({ status: "FAILED" });
    expect(mocks.db.movie.create).not.toHaveBeenCalled();
  });
  it("preserves objects if a transaction committed but its response was lost", async () => {
    mocks.db.$transaction.mockRejectedValue(new Error("connection lost"));
    mocks.db.sourceItem.findUnique.mockResolvedValue({ state: "DONE", movieId: "scan_i" });
    expect(await processItem(source, "lease", vi.fn(), new AbortController().signal)).toMatchObject({ status: "DONE" });
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });
});
