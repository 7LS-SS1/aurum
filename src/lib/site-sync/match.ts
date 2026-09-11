import type { WpScannedPost } from "@/lib/wordpress-client";
import { canonicalizeVideoUrl, normalizeSlug, normalizeTitle } from "./normalize";

export type MatchStrategy = "aurum_movie_id";

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
 * Only the exact AURUM identity can authorize reconciliation. Media URL,
 * slug, and title remain diagnostic index data but can never authorize a
 * write or suppress a new-item decision.
 * Returns the first match found, or null if this movie has no existing post
 * on the destination site.
 */
export function findMatch(movie: MovieForMatch, index: WpMatchIndex): MatchResult | null {
  const byId = index.byMovieId.get(movie.id);
  if (byId) return { entry: byId, strategy: "aurum_movie_id" };

  return null;
}

/** Weak evidence is diagnostic-only; it blocks blind creation but never authorizes a write. */
export function hasWeakIdentityCandidate(movie: MovieForMatch, index: WpMatchIndex): boolean {
  if (movie.jwPlayerMediaId && index.byMediaId.has(movie.jwPlayerMediaId)) return true;
  const url = canonicalizeVideoUrl(movie.videoUrl);
  if (url && index.byVideoUrl.has(url)) return true;
  const slug = normalizeSlug(movie.slug);
  if (slug && index.bySlug.has(slug)) return true;
  const title = normalizeTitle(movie.title);
  return Boolean(title && index.byTitle.has(title));
}
