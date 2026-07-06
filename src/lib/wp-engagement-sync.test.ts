import { describe, it, expect, vi, beforeEach } from "vitest";

const distributionFindMany = vi.fn();
const distributionUpdate = vi.fn();
const distributionAggregate = vi.fn();
const movieUpdate = vi.fn();
const decryptMock = vi.fn();
const getAurumEngagementMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    distribution: { findMany: distributionFindMany, update: distributionUpdate, aggregate: distributionAggregate },
    movie: { update: movieUpdate },
  },
}));

vi.mock("@/lib/crypto", () => ({ decrypt: decryptMock }));

vi.mock("@/lib/wordpress-client", () => ({
  WordPressClient: vi.fn().mockImplementation(() => ({ getAurumEngagement: getAurumEngagementMock })),
}));

const { syncWordPressEngagement } = await import("./wp-engagement-sync");

function fakeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "d1",
    movieId: "m1",
    siteId: "s1",
    remotePostId: "10",
    site: {
      baseUrl: "https://wp.example.com",
      authType: "APP_PASSWORD",
      wpUsername: "admin",
      credentialEnc: "enc",
      credentialIv: "iv",
      credentialTag: "tag",
      postType: "posts",
      categoryRestBase: "categories",
      tagRestBase: "tags",
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  decryptMock.mockReturnValue("plain-credential");
});

describe("syncWordPressEngagement", () => {
  it("only queries SUCCESS distributions that have a remotePostId", async () => {
    distributionFindMany.mockResolvedValue([]);
    await syncWordPressEngagement();
    expect(distributionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "SUCCESS", remotePostId: { not: null } } }),
    );
  });

  it("scopes to a single movie when movieId is provided", async () => {
    distributionFindMany.mockResolvedValue([]);
    await syncWordPressEngagement({ movieId: "m1" });
    expect(distributionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "SUCCESS", remotePostId: { not: null }, movieId: "m1" } }),
    );
  });

  it("clamps take between 1 and 200, defaulting to 50", async () => {
    distributionFindMany.mockResolvedValue([]);
    await syncWordPressEngagement({ take: 5000 });
    expect(distributionFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 200 }));

    await syncWordPressEngagement({ take: -5 });
    expect(distributionFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 1 }));

    await syncWordPressEngagement({});
    expect(distributionFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
  });

  it("on success, records remoteViewCount + engagementSyncedAt and then aggregates into Movie.wpViewCount", async () => {
    distributionFindMany.mockResolvedValue([fakeRow()]);
    getAurumEngagementMock.mockResolvedValue({ postId: 10, views: 42, likes: 1, dislikes: 0 });
    distributionAggregate.mockResolvedValue({ _sum: { remoteViewCount: 42 } });

    const result = await syncWordPressEngagement();

    expect(distributionUpdate).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: expect.objectContaining({ remoteViewCount: 42 }),
    });
    expect(movieUpdate).toHaveBeenCalledWith({ where: { id: "m1" }, data: { wpViewCount: 42 } });
    expect(result).toEqual(
      expect.objectContaining({ scanned: 1, success: 1, failed: 0, moviesUpdated: 1 }),
    );
  });

  it("never touches Movie.status", async () => {
    distributionFindMany.mockResolvedValue([fakeRow()]);
    getAurumEngagementMock.mockResolvedValue({ postId: 10, views: 5, likes: 0, dislikes: 0 });
    distributionAggregate.mockResolvedValue({ _sum: { remoteViewCount: 5 } });

    await syncWordPressEngagement();

    expect(movieUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { wpViewCount: 5 } }));
    expect(movieUpdate.mock.calls[0]?.[0].data).not.toHaveProperty("status");
  });

  it("floors and clamps a negative/fractional view count from a misbehaving site to 0", async () => {
    distributionFindMany.mockResolvedValue([fakeRow()]);
    getAurumEngagementMock.mockResolvedValue({ postId: 10, views: -3.7, likes: 0, dislikes: 0 });
    distributionAggregate.mockResolvedValue({ _sum: { remoteViewCount: 0 } });

    await syncWordPressEngagement();

    expect(distributionUpdate).toHaveBeenCalledWith({ where: { id: "d1" }, data: expect.objectContaining({ remoteViewCount: 0 }) });
  });

  it("on failure, still stamps engagementSyncedAt (so a broken site doesn't get retried every run) and records the error", async () => {
    distributionFindMany.mockResolvedValue([fakeRow()]);
    getAurumEngagementMock.mockRejectedValue(new Error("WP site unreachable"));

    const result = await syncWordPressEngagement();

    expect(distributionUpdate).toHaveBeenCalledWith({ where: { id: "d1" }, data: { engagementSyncedAt: expect.any(Date) } });
    expect(distributionAggregate).not.toHaveBeenCalled();
    expect(movieUpdate).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ scanned: 1, success: 0, failed: 1, moviesUpdated: 0 }),
    );
    expect(result.results[0]).toEqual(
      expect.objectContaining({ status: "failed", error: "WP site unreachable" }),
    );
  });
});
