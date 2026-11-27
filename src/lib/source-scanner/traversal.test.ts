import type { VideoSource } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  db: { videoSource: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() }, sourcePage: { upsert: vi.fn(), findFirst: vi.fn(), count: vi.fn(), updateMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() }, sourceItem: { count: vi.fn(), findMany: vi.fn(), createMany: vi.fn(), updateMany: vi.fn() }, $transaction: vi.fn() },
  claimPage: vi.fn(), fence: vi.fn(), event: vi.fn(), readListing: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("./store", () => ({ claimPage: mocks.claimPage, fence: mocks.fence, event: mocks.event }));
vi.mock("./adapters", () => ({ readListing: mocks.readListing }));
vi.mock("./media", () => ({ ingestMedia: vi.fn() }));
import { scanPages } from "./worker";
const source = { id: "s", control: "RUN", deletedAt: null, stopVersion: 1, baseUrl: "https://catalog.test", nextScanAt: new Date(0), scanComplete: false, maxPagesPerRun: 1, maxItemsTotal: 10, scanIntervalMinutes: 60 } as VideoSource;
describe("durable catalog traversal", () => {
  beforeEach(() => {
    vi.resetAllMocks(); mocks.db.$transaction.mockImplementation(async (fn) => fn(mocks.db));
    mocks.db.videoSource.findUnique.mockResolvedValue(source);
    mocks.db.sourcePage.updateMany.mockResolvedValue({ count: 1 }); mocks.db.sourceItem.count.mockResolvedValue(0);
    mocks.db.sourceItem.findMany.mockResolvedValue([]);
    mocks.db.sourcePage.count.mockResolvedValue(0);
    mocks.claimPage.mockResolvedValue({ id: "p", url: source.baseUrl, claimToken: "claim", attempts: 1 });
  });
  it("rejects pagination loops and leaves explicit failure evidence", async () => {
    mocks.readListing.mockResolvedValue({ items: [], next: source.baseUrl, terminal: false });
    mocks.db.sourcePage.findFirst.mockResolvedValue({ id: "p" });
    await scanPages(source, "lease", vi.fn(), new AbortController().signal);
    expect(mocks.db.sourcePage.updateMany.mock.calls.at(-1)![0].data).toMatchObject({ state: "PENDING", errorCode: "PAGINATION_LOOP" });
    expect(mocks.db.sourcePage.createMany).not.toHaveBeenCalled(); expect(mocks.db.videoSource.update).not.toHaveBeenCalled();
  });
  it("persists the next page when the per-run limit is reached", async () => {
    mocks.readListing.mockResolvedValue({ items: [], next: "https://catalog.test/page2", terminal: false });
    mocks.db.sourcePage.findFirst.mockResolvedValue(null);
    await scanPages(source, "lease", vi.fn(), new AbortController().signal);
    expect(mocks.claimPage).toHaveBeenCalledTimes(1);
    expect(mocks.db.sourcePage.createMany).toHaveBeenCalledWith({ data: [{ sourceId: "s", url: "https://catalog.test/page2" }] });
    expect(mocks.db.videoSource.update).not.toHaveBeenCalled();
  });
  it("schedules a new scan only after terminal proof", async () => {
    mocks.readListing.mockResolvedValue({ items: [], next: null, terminal: true });
    await scanPages(source, "lease", vi.fn(), new AbortController().signal);
    expect(mocks.db.videoSource.update).toHaveBeenCalledWith({ where: { id: "s" }, data: { scanComplete: true, nextScanAt: expect.any(Date) } });
  });
  it("does not silently mark a capped catalog complete", async () => {
    mocks.db.sourceItem.count.mockResolvedValue(10);
    mocks.readListing.mockResolvedValue({ items: [{ externalId: "new" }], next: null, terminal: true });
    await scanPages(source, "lease", vi.fn(), new AbortController().signal);
    expect(mocks.db.sourcePage.updateMany.mock.calls[0]![0].data).toMatchObject({ state: "FAILED", terminal: false, errorCode: "ITEM_LIMIT" });
    expect(mocks.db.videoSource.update).not.toHaveBeenCalled();
  });
  it("keeps discovered videos if the automatic scan cannot prove pagination", async () => {
    mocks.readListing.mockResolvedValue({ items: [{ externalId: "candidate" }], next: null, terminal: false, paginationError: "PAGINATION_UNPROVEN" });
    await scanPages(source, "lease", vi.fn(), new AbortController().signal);
    expect(mocks.db.sourceItem.createMany).toHaveBeenCalledWith({ data: [{ externalId: "candidate", sourceId: "s" }] });
    expect(mocks.db.sourcePage.updateMany.mock.calls[0]![0].data).toMatchObject({ state: "FAILED", terminal: false, errorCode: "PAGINATION_UNPROVEN" });
    expect(mocks.db.videoSource.update).not.toHaveBeenCalled();
  });
  it("does not rescan a completed one-shot source or finish while another page is pending", async () => {
    await scanPages({ ...source, scanComplete: true, scanIntervalMinutes: 0 }, "lease", vi.fn(), new AbortController().signal);
    expect(mocks.claimPage).not.toHaveBeenCalled();
    mocks.db.sourcePage.count.mockResolvedValue(1);
    mocks.readListing.mockResolvedValue({ items: [], next: null, terminal: true });
    await scanPages(source, "lease", vi.fn(), new AbortController().signal);
    expect(mocks.db.videoSource.update).not.toHaveBeenCalled();
  });
});
