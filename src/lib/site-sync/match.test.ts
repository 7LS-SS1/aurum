import { describe, it, expect } from "vitest";
import { buildWpMatchIndex, findMatch, type MovieForMatch } from "./match";
import type { WpScannedPost } from "@/lib/wordpress-client";

function post(overrides: Partial<WpScannedPost> = {}): WpScannedPost {
  return {
    id: 1,
    link: "https://site.example/?p=1",
    slug: "existing-slug",
    title: "Existing Title",
    status: "publish",
    aurumMovieId: null,
    jwPlayerMediaId: null,
    videoUrl: null,
    ...overrides,
  };
}

function movie(overrides: Partial<MovieForMatch> = {}): MovieForMatch {
  return {
    id: "movie-1",
    slug: "movie-slug",
    title: "Movie Title",
    videoUrl: "https://cdn.example.com/video.mp4",
    jwPlayerMediaId: "jw-123",
    ...overrides,
  };
}

describe("findMatch", () => {
  it("matches on aurum_movie_id first, even if other fields differ", () => {
    const index = buildWpMatchIndex([post({ id: 42, aurumMovieId: "movie-1", slug: "totally-different", title: "Totally Different" })]);
    const result = findMatch(movie({ id: "movie-1" }), index);
    expect(result).toEqual({ entry: { id: 42, link: "https://site.example/?p=1", slug: "totally-different", title: "Totally Different" }, strategy: "aurum_movie_id" });
  });

  it("falls back to jwplayer media id when aurum_movie_id is absent", () => {
    const index = buildWpMatchIndex([post({ id: 7, jwPlayerMediaId: "jw-123" })]);
    const result = findMatch(movie({ jwPlayerMediaId: "jw-123" }), index);
    expect(result?.strategy).toBe("jwplayer_media_id");
    expect(result?.entry.id).toBe(7);
  });

  it("falls back to canonicalized video url when movie id and media id don't match", () => {
    const index = buildWpMatchIndex([post({ id: 9, videoUrl: "HTTPS://CDN.example.com/video.mp4/" })]);
    const result = findMatch(movie({ jwPlayerMediaId: null, videoUrl: "https://cdn.example.com/video.mp4" }), index);
    expect(result?.strategy).toBe("video_url");
    expect(result?.entry.id).toBe(9);
  });

  it("falls back to slug when nothing stronger matches", () => {
    const index = buildWpMatchIndex([post({ id: 11, slug: "movie-slug" })]);
    const result = findMatch(movie({ jwPlayerMediaId: null, videoUrl: null, slug: "Movie-Slug" }), index);
    expect(result?.strategy).toBe("slug");
    expect(result?.entry.id).toBe(11);
  });

  it("falls back to normalized exact title as the last resort", () => {
    const index = buildWpMatchIndex([post({ id: 13, slug: "unrelated-slug", title: "My &amp; Video&#8217;s Title" })]);
    const result = findMatch(movie({ jwPlayerMediaId: null, videoUrl: null, slug: null, title: "my & video’s title" }), index);
    expect(result?.strategy).toBe("title");
    expect(result?.entry.id).toBe(13);
  });

  it("never fuzzy-matches — a close-but-not-exact title is not a match", () => {
    const index = buildWpMatchIndex([post({ id: 15, slug: "other-slug", title: "The Great Movie" })]);
    const result = findMatch(movie({ jwPlayerMediaId: null, videoUrl: null, slug: null, title: "The Great Movie 2" }), index);
    expect(result).toBeNull();
  });

  it("returns null when the movie has no corresponding remote post at all", () => {
    const index = buildWpMatchIndex([post({ id: 1, slug: "unrelated", title: "Unrelated" })]);
    const result = findMatch(movie({ jwPlayerMediaId: null, videoUrl: null, slug: "nope", title: "Nothing here" }), index);
    expect(result).toBeNull();
  });
});

describe("buildWpMatchIndex", () => {
  it("keeps the first-scanned post when multiple posts share the same key", () => {
    const index = buildWpMatchIndex([post({ id: 1, aurumMovieId: "dup" }), post({ id: 2, aurumMovieId: "dup" })]);
    expect(index.byMovieId.get("dup")?.id).toBe(1);
  });

  it("ignores empty/blank meta values rather than indexing them as matches", () => {
    const index = buildWpMatchIndex([post({ id: 1, aurumMovieId: null, jwPlayerMediaId: null, videoUrl: null, slug: "", title: "" })]);
    expect(index.byMovieId.size).toBe(0);
    expect(index.byMediaId.size).toBe(0);
    expect(index.byVideoUrl.size).toBe(0);
    expect(index.bySlug.size).toBe(0);
    expect(index.byTitle.size).toBe(0);
  });
});
