import type { WpScannedPost } from "@/lib/wordpress-client";
import { canonicalizeVideoUrl, normalizeSlug, normalizeTitle } from "./normalize";

export type MatchStrategy = "aurum_movie_id" | "jwplayer_media_id" | "video_url" | "slug" | "title";

export interface MovieForMatch {
  id: string;
  slug: string | null;
  title: string;
  videoUrl: string | null;
  jwPlayerMediaId: string | null;
}

export interface RemotePostIndexEntry {
  id: number;
  link: string;
  slug: string;
  title: string;
}

export interface WpMatchIndex {
  byMovieId: Map<string, RemotePostIndexEntry>;
  byMediaId: Map<string, RemotePostIndexEntry>;
  byVideoUrl: Map<string, RemotePostIndexEntry>;
  bySlug: Map<string, RemotePostIndexEntry>;
  byTitle: Map<string, RemotePostIndexEntry>;
}

export interface MatchResult {
  entry: RemotePostIndexEntry;
  strategy: MatchStrategy;
}

/**
 * Builds lookup maps from a full WordPress post scan. Only "publish"-worthy
 * candidates end up considered a match target — but callers pass every
 * scanned status here (drafts included) since an AURUM-created draft still
 * means "this movie already has a post, don't create a second one."
 * Earlier entries win ties (first-scanned post keeps the slot) so the
 * comparison stays deterministic if a site somehow has duplicate posts.
 */
export function buildWpMatchIndex(posts: WpScannedPost[]): WpMatchIndex {
  const byMovieId = new Map<string, RemotePostIndexEntry>();
  const byMediaId = new Map<string, RemotePostIndexEntry>();
  const byVideoUrl = new Map<string, RemotePostIndexEntry>();
  const bySlug = new Map<string, RemotePostIndexEntry>();
  const byTitle = new Map<string, RemotePostIndexEntry>();

  for (const post of posts) {
    const entry: RemotePostIndexEntry = { id: post.id, link: post.link, slug: post.slug, title: post.title };

    if (post.aurumMovieId && !byMovieId.has(post.aurumMovieId)) {
      byMovieId.set(post.aurumMovieId, entry);
    }
    if (post.jwPlayerMediaId && !byMediaId.has(post.jwPlayerMediaId)) {
      byMediaId.set(post.jwPlayerMediaId, entry);
    }
    const canonicalUrl = canonicalizeVideoUrl(post.videoUrl);
    if (canonicalUrl && !byVideoUrl.has(canonicalUrl)) {
      byVideoUrl.set(canonicalUrl, entry);
    }
    const slugKey = normalizeSlug(post.slug);
    if (slugKey && !bySlug.has(slugKey)) {
      bySlug.set(slugKey, entry);
    }
    const titleKey = normalizeTitle(post.title);
    if (titleKey && !byTitle.has(titleKey)) {
      byTitle.set(titleKey, entry);
    }
  }

  return { byMovieId, byMediaId, byVideoUrl, bySlug, byTitle };
}

/**
 * Duplicate-detection priority (never fuzzy — see normalize.ts):
 *   1. aurum_movie_id      — exact, unambiguous, set by every AURUM publish.
 *   2. aurum_jwplayer_media_id — for posts published before aurum_movie_id existed.
 *   3. canonicalized video URL — same reasoning, one rung down in confidence.
 *   4. slug, then normalized exact title — last resort for the oldest posts
 *      that predate all AURUM meta fields.
 * Returns the first match found, or null if this movie has no existing post
 * on the destination site.
 */
export function findMatch(movie: MovieForMatch, index: WpMatchIndex): MatchResult | null {
  const byId = index.byMovieId.get(movie.id);
  if (byId) return { entry: byId, strategy: "aurum_movie_id" };

  if (movie.jwPlayerMediaId) {
    const byMedia = index.byMediaId.get(movie.jwPlayerMediaId);
    if (byMedia) return { entry: byMedia, strategy: "jwplayer_media_id" };
  }

  const canonicalUrl = canonicalizeVideoUrl(movie.videoUrl);
  if (canonicalUrl) {
    const byUrl = index.byVideoUrl.get(canonicalUrl);
    if (byUrl) return { entry: byUrl, strategy: "video_url" };
  }

  const slugKey = normalizeSlug(movie.slug);
  if (slugKey) {
    const bySlug = index.bySlug.get(slugKey);
    if (bySlug) return { entry: bySlug, strategy: "slug" };
  }

  const titleKey = normalizeTitle(movie.title);
  if (titleKey) {
    const byTitle = index.byTitle.get(titleKey);
    if (byTitle) return { entry: byTitle, strategy: "title" };
  }

  return null;
}
