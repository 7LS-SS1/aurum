import { describe, expect, it } from "vitest";
import type { WpScannedPost } from "./wordpress-client";
import { buildExpectedVideoMeta, planWordPressVideoRepairs, type RepairMovie } from "./wordpress-video-repair";

const movie: RepairMovie = {
  id: "movie-239",
  title: "SNOS-239 Shirakami Sakika",
  slug: "snos-239-shirakami-sakika",
  videoProvider: "bunny",
  videoUrl: "https://cdn.example.com/239/playlist.m3u8",
  iframeUrl: null,
  thumbnailUrl: "https://cdn.example.com/239/poster.webp",
  previewUrl: null,
  jwPlayerMediaId: null,
};

function post(overrides: Partial<WpScannedPost> = {}): WpScannedPost {
  return {
    id: 48,
    link: "https://javhub24.com/snos-239-shirakami-sakika/",
    slug: "snos-239-shirakami-sakika",
    title: "SNOS-239 Shirakami Sakika",
    status: "publish",
    aurumMovieId: null,
    jwPlayerMediaId: null,
    videoUrl: null,
    content: '<!-- aurum-video --><div class="aurum-video"><a href="https://cdn.example.com/239/playlist.m3u8">Watch video</a></div>',
    meta: {},
    ...overrides,
  };
}

describe("planWordPressVideoRepairs", () => {
  it("selects post 48 by remotePostId first and only plans meta changes", () => {
    const plans = planWordPressVideoRepairs([post()], [movie], [{ movieId: movie.id, remotePostId: "48" }]);
    expect(plans).toHaveLength(1);
    const plan = plans[0]!;
    expect(plan).toMatchObject({ postId: 48, movieId: movie.id, strategy: "remote_post_id", status: "repair" });
    expect(plan.changedFields).toContain("aurum_movie_id");
    expect(plan.changedFields).toContain("video_url");
  });

  it("falls back to URL, then slug and exact normalized title", () => {
    const url = planWordPressVideoRepairs([post({ id: 50 })], [movie], [])[0]!;
    const slug = planWordPressVideoRepairs([post({ id: 51, content: '<!-- aurum-video --><div class="aurum-video"><a href="https://other.example/x.m3u8">Watch video</a></div>' })], [movie], [])[0]!;
    const title = planWordPressVideoRepairs([post({ id: 52, slug: "different", content: '<!-- aurum-video --><div class="aurum-video"><a href="https://other.example/x.m3u8">Watch video</a></div>' })], [movie], [])[0]!;
    expect(url.strategy).toBe("video_url");
    expect(slug.strategy).toBe("slug");
    expect(title.strategy).toBe("title");
  });

  it("is idempotent once every expected field is present", () => {
    const expected = buildExpectedVideoMeta(movie);
    const plan = planWordPressVideoRepairs([post({ meta: expected })], [movie], [{ movieId: movie.id, remotePostId: "48" }])[0]!;
    expect(plan.status).toBe("noop");
    expect(plan.changedFields).toEqual([]);
  });

  it("never plans a write when a weak match is ambiguous", () => {
    const duplicate = { ...movie, id: "movie-duplicate" };
    const plan = planWordPressVideoRepairs([post({ id: 60 })], [movie, duplicate], [])[0]!;
    expect(plan.status).toBe("unmatched");
  });

  it("ignores ordinary posts without an AURUM marker or fallback block", () => {
    const plans = planWordPressVideoRepairs([post({ content: "<p>Editorial copy</p>" })], [movie], []);
    expect(plans).toEqual([]);
  });
});
