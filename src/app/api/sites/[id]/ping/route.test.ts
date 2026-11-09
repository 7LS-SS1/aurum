import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();
const updateMany = vi.fn();
const transaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback({
  distribution: { updateMany },
  targetSite: { update },
}));
const integrationHealth = vi.fn();
const ping = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { targetSite: { findUnique, update }, $transaction: transaction },
}));
vi.mock("@/lib/authz", () => ({ requireMinRole: vi.fn().mockResolvedValue({ id: "user-1" }) }));
vi.mock("@/lib/crypto", () => ({ decrypt: vi.fn(() => "secret") }));
vi.mock("@/lib/wordpress-client", () => ({
  WordPressClient: class {
    ping = ping;
    integrationHealth = integrationHealth;
  },
}));

const { POST } = await import("./route");

const site = {
  id: "site-1",
  baseUrl: "https://example.test",
  authType: "APP_PASSWORD",
  wpUsername: "admin",
  credentialEnc: "encrypted",
  credentialIv: "iv",
  credentialTag: "tag",
  postType: "posts",
  categoryRestBase: "categories",
  tagRestBase: "tags",
};

beforeEach(() => {
  vi.clearAllMocks();
  findUnique.mockResolvedValue(site);
  ping.mockResolvedValue(true);
  integrationHealth.mockResolvedValue({
    ready: true,
    version: "1.3.6",
    issues: [],
    profile: { postType: "video", categoryRestBase: "video_category", tagRestBase: "video_tag" },
  });
  updateMany.mockResolvedValue({ count: 3 });
  update.mockResolvedValue(site);
});

describe("POST /api/sites/[id]/ping", () => {
  it("adopts the active WordPress profile and snapshots existing remote routes", async () => {
    const response = await POST(new Request("https://aurum.test") as never, { params: Promise.resolve({ id: site.id }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ healthStatus: "OK", profileChanged: true, siteProfile: {
      postType: "video", categoryRestBase: "video_category", tagRestBase: "video_tag",
    } });
    expect(updateMany).toHaveBeenCalledWith({
      where: { siteId: site.id, remotePostId: { not: null }, remotePostType: null },
      data: { remotePostType: "posts", remoteCategoryRestBase: "categories", remoteTagRestBase: "tags" },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: site.id },
      data: { postType: "video", categoryRestBase: "video_category", tagRestBase: "video_tag" },
    });
  });
});
