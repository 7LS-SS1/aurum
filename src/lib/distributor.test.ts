import { describe, it, expect, vi, beforeEach } from "vitest";

const movieFindUnique = vi.fn();
const movieUpdate = vi.fn();
const targetSiteFindMany = vi.fn();
const movieSiteDraftFindMany = vi.fn();
const distributionUpsert = vi.fn();
const distributionUpdate = vi.fn();
const decryptMock = vi.fn();
const createPostMock = vi.fn();
const resolveCategoryTreeMock = vi.fn();
const resolveTermsMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    movie: { findUnique: movieFindUnique, update: movieUpdate },
    targetSite: { findMany: targetSiteFindMany },
    movieSiteDraft: { findMany: movieSiteDraftFindMany },
    distribution: { upsert: distributionUpsert, update: distributionUpdate },
  },
}));

vi.mock("@/lib/crypto", () => ({ decrypt: decryptMock }));

vi.mock("@/lib/wordpress-client", () => ({
  WordPressClient: vi.fn().mockImplementation(() => ({
    createPost: createPostMock,
    resolveCategoryTree: resolveCategoryTreeMock,
    resolveTerms: resolveTermsMock,
  })),
}));

const { distributeToSite, distributeMovie } = await import("./distributor");

function fakeMovie(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    title: "Test Movie",
    slug: null,
    excerpt: "excerpt",
    content: "content",
    categories: [],
    tags: [],
    extraMeta: {},
    mainCategory: null,
    videoProvider: "external",
    videoUrl: "https://cdn.example.com/v.mp4",
    iframeUrl: null,
    thumbnailUrl: null,
    previewUrl: null,
    jwPlayerMediaId: null,
    ...overrides,
  };
}

function fakeSite(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
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
    defaultStatus: "publish",
    isActive: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  decryptMock.mockReturnValue("decrypted-credential");
  resolveCategoryTreeMock.mockResolvedValue([]);
  resolveTermsMock.mockResolvedValue([]);
});

describe("distributeToSite", () => {
  it("marks the distribution PROCESSING before attempting the post", async () => {
    createPostMock.mockResolvedValue({ id: 10, link: "https://wp.example.com/?p=10" });
    await distributeToSite(fakeMovie() as never, fakeSite() as never, undefined);

    expect(distributionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { movieId_siteId: { movieId: "m1", siteId: "s1" } },
        update: { status: "PROCESSING", attempts: { increment: 1 } },
        create: { movieId: "m1", siteId: "s1", status: "PROCESSING", attempts: 1 },
      }),
    );
  });

  it("on success, updates the distribution to SUCCESS with the remote post id/url", async () => {
    createPostMock.mockResolvedValue({ id: 10, link: "https://wp.example.com/?p=10" });

    const result = await distributeToSite(fakeMovie() as never, fakeSite() as never, undefined);

    expect(distributionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SUCCESS", remotePostId: "10", remotePostUrl: "https://wp.example.com/?p=10" }),
      }),
    );
    expect(result).toEqual({ siteId: "s1", site: "Site One", status: "success", postId: 10, url: "https://wp.example.com/?p=10" });
  });

  it("on failure, updates the distribution to FAILED with a truncated error message and returns a failed result", async () => {
    createPostMock.mockRejectedValue(new Error("x".repeat(2000)));

    const result = await distributeToSite(fakeMovie() as never, fakeSite() as never, undefined);

    const call = distributionUpdate.mock.calls[0]?.[0];
    expect(call.data.status).toBe("FAILED");
    expect(call.data.errorMessage.length).toBe(1000);
    expect(result.status).toBe("failed");
  });

  it("prefers the draft's title/slug/content over the movie's own fields when present", async () => {
    createPostMock.mockResolvedValue({ id: 1, link: "https://x/1" });
    await distributeToSite(
      fakeMovie({ title: "Original Title" }) as never,
      fakeSite() as never,
      { title: "Draft Title", slug: "draft-slug", excerpt: null, content: null, categories: null, tags: null, extraMeta: null } as never,
    );
    const payload = createPostMock.mock.calls[0]?.[0];
    expect(payload.title).toBe("Draft Title");
    expect(payload.slug).toBe("draft-slug");
  });

  it("embeds a fallback <a> link in content when there is a plain videoUrl and no iframe", async () => {
    createPostMock.mockResolvedValue({ id: 1, link: "https://x/1" });
    await distributeToSite(fakeMovie({ content: "" }) as never, fakeSite() as never, undefined);
    const payload = createPostMock.mock.calls[0]?.[0];
    expect(payload.content).toContain('<a href="https://cdn.example.com/v.mp4"');
  });

  it("decrypts the site's stored credential before constructing the WordPress client", async () => {
    createPostMock.mockResolvedValue({ id: 1, link: "https://x/1" });
    await distributeToSite(fakeMovie() as never, fakeSite() as never, undefined);
    expect(decryptMock).toHaveBeenCalledWith({ ciphertext: "enc", iv: "iv", tag: "tag" });
  });
});

describe("distributeMovie", () => {
  it("throws when the movie doesn't exist", async () => {
    movieFindUnique.mockResolvedValue(null);
    await expect(distributeMovie("missing", ["s1"])).rejects.toThrow("Movie not found");
  });

  it("throws when none of the requested site ids resolve to an active site", async () => {
    movieFindUnique.mockResolvedValue(fakeMovie());
    targetSiteFindMany.mockResolvedValue([]);
    movieSiteDraftFindMany.mockResolvedValue([]);
    await expect(distributeMovie("m1", ["s1"])).rejects.toThrow("No active destination sites found");
  });

  it("sets movie.status to DONE when every site succeeds", async () => {
    movieFindUnique.mockResolvedValue(fakeMovie());
    targetSiteFindMany.mockResolvedValue([fakeSite({ id: "s1" }), fakeSite({ id: "s2" })]);
    movieSiteDraftFindMany.mockResolvedValue([]);
    createPostMock.mockResolvedValue({ id: 1, link: "https://x/1" });

    const summary = await distributeMovie("m1", ["s1", "s2"]);

    expect(summary.status).toBe("done");
    expect(summary.summary).toEqual({ total: 2, success: 2 });
    expect(movieUpdate).toHaveBeenLastCalledWith({ where: { id: "m1" }, data: { status: "DONE" } });
  });

  it("sets movie.status to PARTIAL when some sites fail", async () => {
    movieFindUnique.mockResolvedValue(fakeMovie());
    targetSiteFindMany.mockResolvedValue([fakeSite({ id: "s1" }), fakeSite({ id: "s2" })]);
    movieSiteDraftFindMany.mockResolvedValue([]);
    createPostMock.mockResolvedValueOnce({ id: 1, link: "https://x/1" }).mockRejectedValueOnce(new Error("nope"));

    const summary = await distributeMovie("m1", ["s1", "s2"]);

    expect(summary.status).toBe("partial");
    expect(movieUpdate).toHaveBeenLastCalledWith({ where: { id: "m1" }, data: { status: "PARTIAL" } });
  });

  it("sets movie.status to FAILED when every site fails", async () => {
    movieFindUnique.mockResolvedValue(fakeMovie());
    targetSiteFindMany.mockResolvedValue([fakeSite({ id: "s1" })]);
    movieSiteDraftFindMany.mockResolvedValue([]);
    createPostMock.mockRejectedValue(new Error("nope"));

    const summary = await distributeMovie("m1", ["s1"]);

    expect(summary.status).toBe("failed");
    expect(movieUpdate).toHaveBeenLastCalledWith({ where: { id: "m1" }, data: { status: "FAILED" } });
  });
});
