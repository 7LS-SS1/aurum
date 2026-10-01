import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  itemFind: vi.fn(), itemDuplicate: vi.fn(), itemUpdateMany: vi.fn(), itemFindOrThrow: vi.fn(),
  distributionDuplicate: vi.fn(), logCreate: vi.fn(), transaction: vi.fn(), currentSource: vi.fn(), refresh: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: {
  contentGenerationItem: { findUnique: mocks.itemFind, findFirst: mocks.itemDuplicate, updateMany: mocks.itemUpdateMany, findUniqueOrThrow: mocks.itemFindOrThrow },
  distribution: { findFirst: mocks.distributionDuplicate },
  contentGenerationJobLog: { create: mocks.logCreate },
  $transaction: mocks.transaction,
} }));
vi.mock("./job-service", async () => {
  const actual = await vi.importActual<typeof import("./job-service")>("./job-service");
  return { ...actual, currentMovieSource: mocks.currentSource, refreshContentGenerationJob: mocks.refresh };
});

import { approveContentGenerationItem } from "./review";
import { draftFingerprint, sourceFingerprint } from "./fingerprints";

const source = { title: "ABC-123 Actor", description: "ต้นฉบับ", categories: ["AV"], tags: ["HD"], actors: ["Actor"] };
const sourceHash = sourceFingerprint(source);
const storedDraft = { title: "ABC-123 Actor ชื่อใหม่", description: "รายละเอียดใหม่", focusKeyword: "ABC-123" };
const draftHash = draftFingerprint({ sourceFingerprint: sourceHash, ...storedDraft });
const item = {
  id: "item-1", jobId: "job-1", movieId: "movie-1", siteId: "site-1", status: "READY_FOR_REVIEW",
  sourceTitle: source.title, sourceFingerprint: sourceHash, draftFingerprint: draftHash,
};

describe("content draft approval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.itemFind.mockResolvedValue(item);
    mocks.currentSource.mockResolvedValue(source);
    mocks.itemDuplicate.mockResolvedValue(null);
    mocks.distributionDuplicate.mockResolvedValue(null);
    mocks.itemUpdateMany.mockResolvedValue({ count: 1 });
    mocks.itemFindOrThrow.mockResolvedValue({ ...item, status: "APPROVED" });
    mocks.logCreate.mockResolvedValue({});
    mocks.refresh.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation(async (callback: (tx: object) => unknown) => callback({
      contentGenerationItem: { updateMany: mocks.itemUpdateMany, findUniqueOrThrow: mocks.itemFindOrThrow },
      contentGenerationJobLog: { create: mocks.logCreate },
    }));
  });

  it("approves an edited draft without publishing WordPress", async () => {
    const result = await approveContentGenerationItem({
      itemId: item.id, expectedSourceFingerprint: sourceHash, expectedDraftFingerprint: draftHash,
      draftTitle: "ABC-123 Actor ชื่อแก้ไข", draftDescription: "รายละเอียดที่ตรวจแล้ว", draftFocusKeyword: "ABC-123",
    }, { id: "manager-1", role: "MANAGER" });
    expect(result.item.status).toBe("APPROVED");
    expect(mocks.itemUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "APPROVED", approvedById: "manager-1", approvedTitleNormalized: "abc-123 actor ชื่อแก้ไข" }),
    }));
    expect(mocks.refresh).toHaveBeenCalledWith("job-1");
  });

  it("blocks a stale browser draft", async () => {
    await expect(approveContentGenerationItem({
      itemId: item.id, expectedSourceFingerprint: sourceHash, expectedDraftFingerprint: "b".repeat(64),
      draftTitle: storedDraft.title, draftDescription: storedDraft.description, draftFocusKeyword: storedDraft.focusKeyword,
    }, { id: "manager-1", role: "MANAGER" })).rejects.toThrow("draft_fingerprint_mismatch");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("blocks a title already approved on the same site", async () => {
    mocks.itemDuplicate.mockResolvedValueOnce({ id: "other" }).mockResolvedValue(null);
    await expect(approveContentGenerationItem({
      itemId: item.id, expectedSourceFingerprint: sourceHash, expectedDraftFingerprint: draftHash,
      draftTitle: storedDraft.title, draftDescription: storedDraft.description, draftFocusKeyword: storedDraft.focusKeyword,
    }, { id: "manager-1", role: "MANAGER" })).rejects.toThrow("duplicate_title_on_destination_site");
  });
});
