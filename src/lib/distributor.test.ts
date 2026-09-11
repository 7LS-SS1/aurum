import { describe, it, expect, vi, beforeEach } from "vitest";

const movieFindUnique = vi.fn();
const movieUpdate = vi.fn();
const targetSiteFindMany = vi.fn();
const movieSiteDraftFindMany = vi.fn();
const distributionUpsert = vi.fn();
const distributionUpdate = vi.fn();
const decryptMock = vi.fn();
const createPostMock = vi.fn();
const updatePostMock = vi.fn();
const getPostMock = vi.fn();
const findPostByAurumMovieIdMock = vi.fn();
const verifyVideoMetaMock = vi.fn();
const resolveCategoryTreeMock = vi.fn();
const resolveTermsMock = vi.fn();
const uploadMediaFromUrlMock = vi.fn();
const syncActorMock = vi.fn();
const executeRawMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    movie: { findUnique: movieFindUnique, update: movieUpdate },
    targetSite: { findMany: targetSiteFindMany },
    movieSiteDraft: { findMany: movieSiteDraftFindMany },
    distribution: { upsert: distributionUpsert, update: distributionUpdate },
    $executeRaw: executeRawMock,
  },
}));

vi.mock("@/lib/crypto", () => ({ decrypt: decryptMock }));

vi.mock("@/lib/wordpress-client", () => ({
  AURUM_VIDEO_META_KEYS: [
    "aurum_movie_id",
    "aurum_provider",
    "aurum_video_url",
    "aurum_iframe_url",
    "aurum_thumbnail_url",
    "aurum_preview_url",
    "aurum_jwplayer_media_id",
    "video_provider",
    "video_url",
    "iframe_url",
    "thumbnail_url",
    "preview_url",
    "jwplayer_media_id",
  ],
  WordPressClient: vi.fn().mockImplementation(() => ({
    createPost: createPostMock,
    updatePost: updatePostMock,
    getPost: getPostMock,
    findPostByAurumMovieId: findPostByAurumMovieIdMock,
    verifyVideoMeta: verifyVideoMetaMock,
    resolveCategoryTree: resolveCategoryTreeMock,
    resolveTerms: resolveTermsMock,
    uploadMediaFromUrl: uploadMediaFromUrlMock,
    syncActor: syncActorMock,
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
    actors: [],
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
  uploadMediaFromUrlMock.mockResolvedValue(321);
  distributionUpsert.mockResolvedValue({ id: "dist1", remotePostId: null });
  verifyVideoMetaMock.mockResolvedValue(undefined);
  executeRawMock.mockResolvedValue(undefined);
  findPostByAurumMovieIdMock.mockResolvedValue(null);
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
    expect(verifyVideoMetaMock).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        aurum_movie_id: "m1",
        aurum_video_url: "https://cdn.example.com/v.mp4",
        video_url: "https://cdn.example.com/v.mp4",
      }),
    );
  });

  it("fails closed and preserves the created post id when WordPress silently drops video meta", async () => {
    createPostMock.mockResolvedValue({ id: 48, link: "https://wp.example.com/?p=48" });
    verifyVideoMetaMock.mockRejectedValue(
      new Error("AURUM Video Core integration is not ready: aurum_movie_id, aurum_video_url"),
    );

    const result = await distributeToSite(fakeMovie() as never, fakeSite() as never, undefined);

    expect(result.status).toBe("failed");
    expect(distributionUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          remotePostId: "48",
          remotePostUrl: "https://wp.example.com/?p=48",
        }),
      }),
    );
  });

  it("refreshes an identified post with video meta only and preserves WordPress-owned fields", async () => {
    distributionUpsert.mockResolvedValue({ id: "dist1", remotePostId: "48" });
    const remote = {
      id: 48, link: "https://wp.example.com/?p=48", status: "publish", slug: "editor-slug",
      title: "Editor title", content: "<p>Editor content</p>", excerpt: "Editor excerpt",
      categories: [7], tags: [8], featuredMedia: 9,
      meta: { aurum_movie_id: "m1", rank_math_description: "Editor SEO" },
    };
    getPostMock.mockResolvedValue(remote);
    updatePostMock.mockResolvedValue({ id: 48, link: remote.link, status: "publish" });
    verifyVideoMetaMock.mockResolvedValue({ ...remote, meta: { ...remote.meta, aurum_video_url: "https://cdn.example.com/v.mp4" } });

    const result = await distributeToSite(fakeMovie({ title: "AURUM title" }) as never, fakeSite() as never, undefined);

    expect(result.status).toBe("success");
    expect(createPostMock).not.toHaveBeenCalled();
    expect(updatePostMock).toHaveBeenCalledWith(48, { meta: expect.objectContaining({ aurum_movie_id: "m1" }) });
    const payload = updatePostMock.mock.calls[0]?.[1];
    expect(payload).not.toHaveProperty("title");
    expect(payload).not.toHaveProperty("slug");
    expect(payload).not.toHaveProperty("content");
    expect(payload).not.toHaveProperty("excerpt");
    expect(payload.meta).not.toHaveProperty("rank_math_description");
  });

  it("fails closed when remotePostId belongs to another AURUM movie", async () => {
    distributionUpsert.mockResolvedValue({ id: "dist1", remotePostId: "48" });
    getPostMock.mockResolvedValue({ id: 48, meta: { aurum_movie_id: "another-movie" } });
    const result = await distributeToSite(fakeMovie() as never, fakeSite() as never, undefined);
    expect(result.status).toBe("failed");
    expect(result.error).toBe("wordpress_identity_conflict");
    expect(createPostMock).not.toHaveBeenCalled();
    expect(updatePostMock).not.toHaveBeenCalled();
  });

  it("distinguishes missing identity when the post was not identified by the distribution row", async () => {
    findPostByAurumMovieIdMock.mockResolvedValue({ id: 48, aurumMovieId: "m1" });
    getPostMock.mockResolvedValue({ id: 48, meta: {} });

    const result = await distributeToSite(fakeMovie() as never, fakeSite() as never, undefined);

    expect(result).toMatchObject({ status: "failed", error: "wordpress_identity_missing" });
    expect(updatePostMock).not.toHaveBeenCalled();
  });

  it("repairs missing identity from the exact distribution remotePostId and verifies the metadata read-back", async () => {
    distributionUpsert.mockResolvedValue({ id: "dist1", remotePostId: "48", distributedAt: null });
    const remote = {
      id: 48, link: "https://wp.example.com/?p=48", status: "publish", slug: "editor-slug",
      title: "Editor title", content: "Editor content", excerpt: "Editor excerpt",
      categories: [7], tags: [8], featuredMedia: 9, meta: { rank_math_description: "Editor SEO" },
    };
    getPostMock.mockResolvedValue(remote);
    updatePostMock.mockResolvedValue({ id: 48, link: remote.link, status: "publish" });
    verifyVideoMetaMock.mockResolvedValue({
      ...remote,
      meta: { ...remote.meta, aurum_movie_id: "m1", aurum_video_url: "https://cdn.example.com/v.mp4" },
    });

    const result = await distributeToSite(fakeMovie() as never, fakeSite() as never, undefined);

    expect(result.status).toBe("success");
    expect(updatePostMock).toHaveBeenCalledWith(48, { meta: expect.objectContaining({ aurum_movie_id: "m1" }) });
    expect(verifyVideoMetaMock).toHaveBeenCalledWith(48, expect.objectContaining({ aurum_movie_id: "m1" }));
    expect(updatePostMock.mock.calls[0]?.[1]).not.toHaveProperty("title");
    expect(updatePostMock.mock.calls[0]?.[1]).not.toHaveProperty("content");
  });

  it("recovers an earlier create by exact aurum_movie_id instead of creating a duplicate", async () => {
    findPostByAurumMovieIdMock.mockResolvedValue({ id: 48, aurumMovieId: "m1" });
    const remote = { id: 48, link: "https://wp.example.com/?p=48", status: "publish", slug: "s", title: "T", content: "C", excerpt: "E", categories: [], tags: [], featuredMedia: 0, meta: { aurum_movie_id: "m1" } };
    getPostMock.mockResolvedValue(remote);
    updatePostMock.mockResolvedValue({ id: 48, link: remote.link, status: "publish" });
    verifyVideoMetaMock.mockResolvedValue(remote);
    const result = await distributeToSite(fakeMovie() as never, fakeSite() as never, undefined);
    expect(result.status).toBe("success");
    expect(createPostMock).not.toHaveBeenCalled();
    expect(updatePostMock).toHaveBeenCalledWith(48, expect.objectContaining({ meta: expect.any(Object) }));
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

  it("keeps video identity authoritative and leaves Yoast private meta to Yoast public hooks", async () => {
    createPostMock.mockResolvedValue({ id: 1, link: "https://x/1" });
    resolveCategoryTreeMock.mockResolvedValue([44, 45]);

    await distributeToSite(
      fakeMovie({
        title: "SEO Title",
        excerpt: "This is the SEO description.",
        mainCategory: "Drama",
        categories: ["Indie"],
        tags: [{ name: "feature" }],
        thumbnailUrl: "https://cdn.example.com/poster.jpg",
      }) as never,
      fakeSite() as never,
      undefined,
    );

    const payload = createPostMock.mock.calls[0]?.[0];
    expect(payload.meta).toEqual(expect.objectContaining({ aurum_movie_id: "m1", aurum_thumbnail_url: "https://cdn.example.com/poster.jpg" }));
    expect(payload.meta).not.toHaveProperty("_yoast_wpseo_title");
    expect(payload.meta).not.toHaveProperty("_yoast_wpseo_primary_category");
  });

  it("does not allow draft extraMeta to override canonical video fields", async () => {
    createPostMock.mockResolvedValue({ id: 1, link: "https://x/1" });
    await distributeToSite(
      fakeMovie() as never,
      fakeSite() as never,
      { extraMeta: { aurum_video_url: "https://attacker.example/redirect.m3u8" } } as never,
    );

    expect(createPostMock.mock.calls[0]?.[0].meta.aurum_video_url).toBe("https://cdn.example.com/v.mp4");
  });

  it("imports the thumbnail as featured media when possible", async () => {
    createPostMock.mockResolvedValue({ id: 1, link: "https://x/1" });
    uploadMediaFromUrlMock.mockResolvedValue(777);

    await distributeToSite(fakeMovie({ thumbnailUrl: "https://cdn.example.com/poster.jpg" }) as never, fakeSite() as never, undefined);

    const payload = createPostMock.mock.calls[0]?.[0];
    expect(uploadMediaFromUrlMock).toHaveBeenCalledWith("https://cdn.example.com/poster.jpg");
    expect(payload.featured_media).toBe(777);
  });

  it("still publishes when featured media import fails", async () => {
    createPostMock.mockResolvedValue({ id: 1, link: "https://x/1" });
    uploadMediaFromUrlMock.mockRejectedValue(new Error("image blocked"));

    await distributeToSite(fakeMovie({ thumbnailUrl: "https://cdn.example.com/poster.jpg" }) as never, fakeSite() as never, undefined);

    const payload = createPostMock.mock.calls[0]?.[0];
    expect(payload.featured_media).toBeUndefined();
    expect(createPostMock).toHaveBeenCalled();
  });

  it("decrypts the site's stored credential before constructing the WordPress client", async () => {
    createPostMock.mockResolvedValue({ id: 1, link: "https://x/1" });
    await distributeToSite(fakeMovie() as never, fakeSite() as never, undefined);
    expect(decryptMock).toHaveBeenCalledWith({ ciphertext: "enc", iv: "iv", tag: "tag" });
  });

  it("syncs each of the movie's actors and attaches their term ids to the post payload", async () => {
    createPostMock.mockResolvedValue({ id: 1, link: "https://x/1" });
    syncActorMock.mockResolvedValueOnce({
      remoteId: 501,
      termId: 901,
      status: "updated",
      payload: { externalId: "a1", slug: "aurum-actor-a1", name: "Actor One", bio: "", profileImageUrl: null,
        metadata: { age: null, heightCm: null, weightKg: null, measurementBust: null, measurementWaist: null, measurementHip: null } },
    });

    await distributeToSite(
      fakeMovie({
        actors: [{ id: "a1", name: "Actor One", bio: "", profileImageUrl: null,
          age: null, heightCm: null, weightKg: null, measurementBust: null, measurementWaist: null, measurementHip: null }],
      }) as never,
      fakeSite() as never,
      undefined,
    );

    expect(syncActorMock).toHaveBeenCalledTimes(1);
    expect(executeRawMock).toHaveBeenCalledTimes(1);
    const payload = createPostMock.mock.calls[0]?.[0];
    expect(payload.aurum_video_actor).toEqual([901]);
  });

  it("still publishes the video when an actor fails to sync", async () => {
    createPostMock.mockResolvedValue({ id: 1, link: "https://x/1" });
    syncActorMock.mockRejectedValueOnce(new Error("actor sync failed"));

    const result = await distributeToSite(
      fakeMovie({
        actors: [{ id: "a1", name: "Actor One", bio: "", profileImageUrl: null,
          age: null, heightCm: null, weightKg: null, measurementBust: null, measurementWaist: null, measurementHip: null }],
      }) as never,
      fakeSite() as never,
      undefined,
    );

    expect(result.status).toBe("success");
    const payload = createPostMock.mock.calls[0]?.[0];
    expect(payload.aurum_video_actor).toBeUndefined();
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
