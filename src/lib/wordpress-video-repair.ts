import type { AurumVideoMeta, WpScannedPost } from "./wordpress-client";
export type RepairMatchStrategy = "remote_post_id" | "aurum_movie_id";

export interface RepairMovie {
  id: string;
  title: string;
  slug: string | null;
  videoProvider: string | null;
  videoUrl: string | null;
  iframeUrl: string | null;
  thumbnailUrl: string | null;
  previewUrl: string | null;
  jwPlayerMediaId: string | null;
}

export interface RepairDistribution {
  movieId: string;
  remotePostId: string | null;
}

export interface VideoMetaRepairPlan {
  postId: number;
  postUrl: string;
  movieId: string | null;
  strategy: RepairMatchStrategy | null;
  expectedMeta: AurumVideoMeta | null;
  changedFields: string[];
  status: "repair" | "noop" | "unmatched";
}

export function buildExpectedVideoMeta(movie: RepairMovie, resolvedIframeUrl = movie.iframeUrl ?? ""): AurumVideoMeta {
  return {
    aurum_movie_id: movie.id,
    aurum_provider: movie.videoProvider ?? "",
    aurum_video_url: movie.videoUrl ?? "",
    aurum_iframe_url: resolvedIframeUrl,
    aurum_thumbnail_url: movie.thumbnailUrl ?? "",
    aurum_preview_url: movie.previewUrl ?? "",
    aurum_jwplayer_media_id: movie.jwPlayerMediaId ?? "",
    video_provider: movie.videoProvider ?? "",
    video_url: movie.videoUrl ?? "",
    iframe_url: resolvedIframeUrl,
    thumbnail_url: movie.thumbnailUrl ?? "",
    preview_url: movie.previewUrl ?? "",
    jwplayer_media_id: movie.jwPlayerMediaId ?? "",
  };
}

export function hasAurumFallback(content: string | undefined): boolean {
  if (!content) return false;
  return /<!--\s*aurum-video\s*-->/i.test(content) || /<div\b[^>]*class=["'][^"']*\baurum-video\b[^"']*["'][^>]*>[\s\S]*?<a\b/i.test(content);
}

export function fallbackVideoUrl(content: string | undefined): string | null {
  if (!content) return null;
  const block = content.match(
    /(?:<!--\s*aurum-video\s*-->\s*)?<div\b[^>]*class=["'][^"']*\baurum-video\b[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["']/i,
  );
  return block?.[1]?.trim() || null;
}

/** Produces a deterministic, write-free plan from strong identity evidence only. */
export function planWordPressVideoRepairs(
  posts: WpScannedPost[],
  movies: RepairMovie[],
  distributions: RepairDistribution[],
): VideoMetaRepairPlan[] {
  const movieById = new Map(movies.map((movie) => [movie.id, movie]));
  const movieByRemotePostId = new Map<string, RepairMovie>();
  for (const distribution of distributions) {
    const movie = movieById.get(distribution.movieId);
    if (movie && distribution.remotePostId) movieByRemotePostId.set(distribution.remotePostId, movie);
  }

  return posts.map((post) => {
    let movie = movieByRemotePostId.get(String(post.id));
    let strategy: RepairMatchStrategy | null = movie ? "remote_post_id" : null;

    const meta = post.meta ?? {};
    if (!movie) {
      const movieId = typeof meta.aurum_movie_id === "string" ? meta.aurum_movie_id.trim() : "";
      movie = movieById.get(movieId);
      if (movie) strategy = "aurum_movie_id";
    }

    if (!movie) {
      return {
        postId: post.id,
        postUrl: post.link,
        movieId: null,
        strategy: null,
        expectedMeta: null,
        changedFields: [],
        status: "unmatched" as const,
      };
    }

    const expectedMeta = buildExpectedVideoMeta(movie);
    const changedFields = Object.entries(expectedMeta)
      .filter(([key, expected]) => String(meta[key] ?? "") !== expected)
      .map(([key]) => key);
    return {
      postId: post.id,
      postUrl: post.link,
      movieId: movie.id,
      strategy,
      expectedMeta,
      changedFields,
      status: changedFields.length ? ("repair" as const) : ("noop" as const),
    };
  });
}
