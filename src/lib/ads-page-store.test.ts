import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  servicePageConfig: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  auditLog: { create: vi.fn() },
  adsOrder: { count: vi.fn() },
  $executeRaw: vi.fn(),
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
import { getAdsPage, saveAdsPage } from "./ads-page-store";
import { defaultAdsPage } from "./ads-page-config";
const actor = { id: "manager", role: "MANAGER" } as Parameters<typeof saveAdsPage>[2];

describe("advertising settings persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation(async callback => callback(db));
    db.servicePageConfig.findUnique.mockResolvedValue(null);
    db.servicePageConfig.updateMany.mockResolvedValue({ count: 1 });
    db.adsOrder.count.mockResolvedValue(0);
  });
  it("reads a separate settings record with approved defaults", async () => {
    expect((await getAdsPage()).config).toEqual(defaultAdsPage);
    expect(db.servicePageConfig.findUnique).toHaveBeenCalledWith({ where: { id: "ads-banner" } });
  });
  it("creates a separate record and audit entry atomically", async () => {
    expect((await saveAdsPage(defaultAdsPage, 0, actor)).revision).toBe(1);
    expect(db.servicePageConfig.create).toHaveBeenCalledWith({ data: { id: "ads-banner", config: defaultAdsPage, revision: 1 } });
    expect(db.auditLog.create).toHaveBeenCalledOnce();
  });
  it("rejects stale revisions without writes", async () => {
    db.servicePageConfig.findUnique.mockResolvedValue({ config: defaultAdsPage, revision: 2 });
    await expect(saveAdsPage(defaultAdsPage, 1, actor)).rejects.toThrow("ads_page_conflict");
    expect(db.servicePageConfig.create).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
  it("rejects a competing update before recording success", async () => {
    db.servicePageConfig.findUnique.mockResolvedValue({ config: defaultAdsPage, revision: 1 });
    db.servicePageConfig.updateMany.mockResolvedValue({ count: 0 });
    await expect(saveAdsPage(defaultAdsPage, 1, actor)).rejects.toThrow("ads_page_conflict");
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
  it("surfaces database failures rather than publishing fallback prices", async () => {
    db.servicePageConfig.findUnique.mockRejectedValue(new Error("connection unavailable"));
    await expect(getAdsPage()).rejects.toThrow("connection unavailable");
  });
  it("protects capacity while a gateway-confirmed order awaits staff review", async () => {
    db.servicePageConfig.findUnique.mockResolvedValue({ config: defaultAdsPage, revision: 1 });
    db.adsOrder.count.mockResolvedValue(1);
    const config = { ...defaultAdsPage, inventoryCounts: { ...defaultAdsPage.inventoryCounts, popup: defaultAdsPage.inventoryCounts.popup + 1 } };
    await expect(saveAdsPage(config, 1, actor)).rejects.toThrow("inventory_in_use");
    expect(db.adsOrder.count.mock.calls[0]?.[0].where.status.in).toContain("PAYMENT_REVIEW");
    expect(db.adsOrder.count.mock.calls[0]?.[0].where.status.in).toEqual(expect.arrayContaining(["GRACE","SCHEDULED"]));
    expect(db.servicePageConfig.updateMany).not.toHaveBeenCalled();
  });
});
