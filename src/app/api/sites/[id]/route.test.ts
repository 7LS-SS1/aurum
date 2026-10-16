import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const updateMany = vi.fn();
const update = vi.fn();
const transaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback({
  distribution: { updateMany },
  targetSite: { update },
}));
const requireMinRole = vi.fn();
const logAudit = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    targetSite: { findUnique },
    $transaction: transaction,
  },
}));
vi.mock("@/lib/authz", () => ({ requireMinRole, requireRole: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit }));

const { PATCH } = await import("./route");

const existingSite = {
  id: "site-1",
  name: "ThaiTube",
  baseUrl: "https://example.test",
  authType: "APP_PASSWORD",
  wpUsername: "admin",
  postType: "posts",
  categoryRestBase: "categories",
  tagRestBase: "tags",
  defaultStatus: "publish",
  mainCategories: [],
  isActive: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireMinRole.mockResolvedValue({ id: "user-1", role: "MANAGER" });
  findUnique.mockResolvedValue(existingSite);
  updateMany.mockResolvedValue({ count: 12 });
  update.mockResolvedValue({ ...existingSite, postType: "video", categoryRestBase: "video_category", tagRestBase: "video_tag" });
  logAudit.mockResolvedValue(undefined);
});

describe("PATCH /api/sites/[id]", () => {
  it("snapshots the old REST profile before changing a site's publishing profile", async () => {
    const request = new Request("https://aurum.test/api/sites/site-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        postType: "video",
        categoryRestBase: "video_category",
        tagRestBase: "video_tag",
      }),
    });

    const response = await PATCH(request as never, { params: Promise.resolve({ id: "site-1" }) });

    expect(response.status).toBe(200);
    expect(updateMany).toHaveBeenCalledWith({
      where: { siteId: "site-1", remotePostId: { not: null }, remotePostType: null },
      data: {
        remotePostType: "posts",
        remoteCategoryRestBase: "categories",
        remoteTagRestBase: "tags",
      },
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "site-1" },
      data: expect.objectContaining({ postType: "video", categoryRestBase: "video_category", tagRestBase: "video_tag" }),
    }));
  });
});
