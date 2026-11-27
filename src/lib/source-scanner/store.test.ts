import type { VideoSource } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  const db = {
    scannerLease: { upsert: vi.fn(), updateMany: vi.fn() },
    sourceItem: { findFirst: vi.fn(), updateMany: vi.fn() },
    sourcePage: { findFirst: vi.fn(), updateMany: vi.fn() },
    videoSource: { findMany: vi.fn(), updateMany: vi.fn() },
    sourceEvent: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    auditLog: { create: vi.fn() }, $transaction: vi.fn(),
  }; return { db };
});
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
import { claimItem, claimPage, fence, recoverStale, withScannerLease } from "./store";
describe("scanner persistence fences", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.db.$transaction.mockImplementation(async (fn) => fn(mocks.db));
    mocks.db.sourceEvent.findMany.mockResolvedValue([]);
    mocks.db.videoSource.updateMany.mockResolvedValue({ count: 1 });
  });
  it("allows only one item claim when workers see the same candidate", async () => {
    const row = { id: "item", state: "PENDING", attempts: 0, updatedAt: new Date() };
    mocks.db.sourceItem.findFirst.mockResolvedValue(row); let taken = false;
    mocks.db.sourceItem.updateMany.mockImplementation(async () => { if (taken) return { count: 0 }; taken = true; return { count: 1 }; });
    const claims = await Promise.all([claimItem("s"), claimItem("s")]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(mocks.db.sourceItem.updateMany.mock.calls[0]![0].where).toMatchObject({ id: "item", state: "PENDING", updatedAt: row.updatedAt, source: { control: "RUN", deletedAt: null } });
  });
  it("CAS protects page claims too", async () => {
    mocks.db.sourcePage.findFirst.mockResolvedValue({ id: "p", state: "PENDING", attempts: 0, updatedAt: new Date() });
    mocks.db.sourcePage.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect((await Promise.all([claimPage("s"), claimPage("s")])).filter(Boolean)).toHaveLength(1);
  });
  it("releases only the current global lease and rejects overlapping runs", async () => {
    mocks.db.scannerLease.updateMany.mockResolvedValueOnce({ count: 0 });
    const work = vi.fn(); await expect(withScannerLease(work)).rejects.toThrow(/BUSY/); expect(work).not.toHaveBeenCalled();
    mocks.db.scannerLease.updateMany.mockResolvedValue({ count: 1 });
    await expect(withScannerLease(async () => { throw new Error("failed"); })).rejects.toThrow("failed");
    const release = mocks.db.scannerLease.updateMany.mock.calls.at(-1)![0];
    expect(release.where.token).toBeTruthy(); expect(release.data.expiresAt).toEqual(new Date(0));
  });
  it("fences STOP/changed generation before Movie transaction and bounds stale retries", async () => {
    mocks.db.scannerLease.updateMany.mockResolvedValue({ count: 1 }); mocks.db.videoSource.updateMany.mockResolvedValue({ count: 0 });
    await expect(fence(mocks.db as never, { id: "s", stopVersion: 1 } as VideoSource, "token")).rejects.toThrow(/STOPPED/);
    await recoverStale();
    expect(mocks.db.sourceItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { state: "PENDING", attempts: { gte: 3 } }, data: { state: "FAILED" } }));
  });
});
