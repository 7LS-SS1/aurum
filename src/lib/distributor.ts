import type { Actor, Movie, Tag, TargetSite } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { invalidatePublicMovieCaches } from "@/lib/cache";
import { decrypt } from "@/lib/crypto";
import {
  AURUM_VIDEO_META_KEYS,
  WordPressClient,
  type AurumVideoMeta,
  type WpEditablePost,
  type WpPost,
} from "@/lib/wordpress-client";
import { actorFingerprint, actorPayload } from "@/lib/actor-sync-contract";
import { buildJwPlayerIframeUrl, getDefaultJwPlayerConfig } from "@/lib/jwplayer";

export interface DistributionResult {
  siteId: string;
  site: string;
  status: "success" | "failed";
  title: string;
  postId?: number;
  url?: string;
  error?: string;
  warnings?: string[];
  /** Internal/public diagnostic hint; only safe transient failures are retried automatically. */
  retryable?: boolean;
}

export interface DistributeSummary {
  movieId: string;
  status: "done" | "partial" | "failed";
  summary: { total: number; success: number };
  results: DistributionResult[];
}

export type DistributionWriteMode = "video_only" | "overwrite_editorial";

/** Fields actorPayload() needs; also the Prisma `select` every findMany/findUnique below reuses. */
export const ACTOR_SYNC_SELECT = {
  id: true, name: true, bio: true, profileImageUrl: true,
  age: true, heightCm: true, weightKg: true,
  measurementBust: true, measurementWaist: true, measurementHip: true,
} as const;
type MovieActor = Pick<Actor, keyof typeof ACTOR_SYNC_SELECT>;

const ACTOR_SYNC_CONCURRENCY = 4;
const SITE_DISTRIBUTION_CONCURRENCY = 3;
const TRANSIENT_RETRY_DELAY_MS = process.env.NODE_ENV === "test" ? 0 : 1_200;

/** Movie.tags/actors are real relations now — every caller that touches merged content needs them eagerly loaded. */
export type MovieWithTags = Movie & { tags: Pick<Tag, "name">[]; actors: MovieActor[] };

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function isTransientDistributionError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (!(error instanceof Error)) return false;
  if (["AbortError", "TimeoutError"].includes(error.name)) return true;
  const status = "status" in error && typeof error.status === "number" ? error.status : undefined;
  return status === 408 || status === 425 || status === 429 || (status !== undefined && status >= 500);
}

function buildContent(text: string, movie: MovieWithTags, iframeUrl?: string): string {
  let html = text;
  if (iframeUrl) {
    html += `\n\n<!-- aurum-video -->\n<div class="aurum-video"><iframe src="${iframeUrl}" loading="lazy" allowfullscreen></iframe></div>`;
  } else if (movie.videoUrl) {
    html += `\n\n<!-- aurum-video -->\n<div class="aurum-video"><a href="${movie.videoUrl}" rel="nofollow">Watch video</a></div>`;
  }
  return html;
}

function mergeContent(movie: MovieWithTags) {
  const extraMeta = (movie.extraMeta as Record<string, unknown>) ?? {};
  return {
    title: movie.title,
    slug: movie.slug ?? undefined,
    excerpt: movie.excerpt ?? "",
    content: movie.content ?? "",
    categories: asStringArray(movie.categories),
    tags: movie.tags.map((t) => t.name),
    extraMeta,
  };
}

/**
 * Push each of the movie's actors to this site's `aurum_video_actor` taxonomy
 * and return the resulting WordPress term IDs, so the video post can attach
 * to them (WP's native REST taxonomy-field auto-assignment — same mechanism
 * already used for categories/tags, keyed by the taxonomy's REST base).
 *
 * Best-effort per actor: a single actor failing to sync (stale plugin,
 * transient error, name conflict) must never fail the whole video
 * distribution — the video still publishes with whatever actor terms did
 * resolve, and the failed actor can be retried from /admin/actors.
 */
async function mapWithConcurrency<T, R>(items: T[], concurrency: number, task: (item: T, index: number) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      try {
        results[index] = { status: "fulfilled", value: await task(items[index]!, index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, () => worker()));
  return results;
}

async function syncMovieActors(client: WordPressClient, actors: MovieActor[], siteId: string): Promise<number[]> {
  const cached = await prisma.actorSync.findMany({
    where: { siteId, actorId: { in: actors.map(actor => actor.id) }, termId: { not: null } },
    select: { actorId: true, termId: true, payloadHash: true },
  });
  const cachedByActor = new Map(cached.map(row => [row.actorId, row]));
  const termIds = new Array<number | null>(actors.length).fill(null);
  const pending: { actor: MovieActor; index: number; payload: ReturnType<typeof actorPayload>; fingerprint: string }[] = [];

  actors.forEach((actor, index) => {
    const payload = actorPayload(actor);
    const fingerprint = actorFingerprint(payload);
    const existing = cachedByActor.get(actor.id);
    if (existing?.termId && existing.payloadHash === fingerprint) {
      termIds[index] = existing.termId;
    } else {
      pending.push({ actor, index, payload, fingerprint });
    }
  });

  await mapWithConcurrency(pending, ACTOR_SYNC_CONCURRENCY, async ({ actor, index, payload, fingerprint }) => {
    try {
      const remote = await client.syncActor(payload);
      if (remote.status !== "existing") {
        await prisma.$executeRaw`INSERT INTO actor_syncs (actor_id, site_id, remote_id, term_id, payload_hash, synced_at)
          VALUES (${actor.id}, ${siteId}, ${remote.remoteId}, ${remote.termId ?? null}, ${fingerprint}, NOW())
          ON CONFLICT (actor_id, site_id) DO UPDATE SET remote_id = EXCLUDED.remote_id,
          term_id = EXCLUDED.term_id, payload_hash = EXCLUDED.payload_hash, synced_at = EXCLUDED.synced_at`;
      }
      if (remote.termId) termIds[index] = remote.termId;
    } catch {
      // Skip this actor; the video still publishes with the actors that did sync.
    }
  });
  return termIds.filter((termId): termId is number => termId !== null);
}

async function resolveIframeUrl(movie: Movie): Promise<string | undefined> {
  if (movie.iframeUrl) return movie.iframeUrl;
  if (movie.videoProvider !== "jwplayer") return undefined;
  return buildJwPlayerIframeUrl(movie.jwPlayerMediaId, await getDefaultJwPlayerConfig());
}

/** The complete canonical + compatibility payload expected back from REST. */
export function buildVideoMeta(movie: Movie, iframeUrl?: string): AurumVideoMeta {
  return {
    aurum_movie_id: movie.id,
    aurum_provider: movie.videoProvider ?? "",
    aurum_video_url: movie.videoUrl ?? "",
    aurum_iframe_url: iframeUrl ?? "",
    aurum_thumbnail_url: movie.thumbnailUrl ?? "",
    aurum_preview_url: movie.previewUrl ?? "",
    aurum_jwplayer_media_id: movie.jwPlayerMediaId ?? "",
    video_url: movie.videoUrl ?? "",
    video_provider: movie.videoProvider ?? "",
    jwplayer_media_id: movie.jwPlayerMediaId ?? "",
    iframe_url: iframeUrl ?? "",
    thumbnail_url: movie.thumbnailUrl ?? "",
    preview_url: movie.previewUrl ?? "",
  };
}

async function buildPayload(client: WordPressClient, movie: MovieWithTags, site: TargetSite) {
  const merged = mergeContent(movie);
  const warnings: string[] = [];
  const iframeUrl = await resolveIframeUrl(movie);

  const payload: Record<string, unknown> = {
    title: merged.title,
    content: buildContent(merged.content || merged.excerpt, movie, iframeUrl),
    excerpt: merged.excerpt,
    status: site.defaultStatus || "publish",
    meta: {
      ...merged.extraMeta,
      // Stable identity and playback fields always win over arbitrary draft
      // extraMeta so a content override cannot redirect or detach a movie.
      ...buildVideoMeta(movie, iframeUrl),
    },
  };
  if (merged.slug) payload.slug = merged.slug;

  const mainCategory = movie.mainCategory ?? "";
  if (mainCategory || merged.categories.length) {
    payload.categories = await client.resolveCategoryTree(site.categoryRestBase, mainCategory, merged.categories);
  }
  if (merged.tags.length) {
    payload.tags = await client.resolveTerms(site.tagRestBase, merged.tags);
  }
  if (movie.actors?.length) {
    const actorTermIds = await syncMovieActors(client, movie.actors, site.id);
    if (actorTermIds.length) payload.aurum_video_actor = actorTermIds;
  }
  if (movie.thumbnailUrl) {
    try {
      payload.featured_media = await client.uploadMediaFromUrl(movie.thumbnailUrl);
    } catch {
      // Keep publishing even if the remote poster cannot be imported.
    }
  }

  return { payload, warnings };
}

function videoOnlyPayload(movie: MovieWithTags, iframeUrl?: string): Record<string, unknown> {
  return { meta: buildVideoMeta(movie, iframeUrl) };
}

function protectedSnapshot(post: WpEditablePost): string {
  const protectedMeta = Object.fromEntries(
    Object.entries(post.meta).filter(([key]) => !AURUM_VIDEO_META_KEYS.includes(key as (typeof AURUM_VIDEO_META_KEYS)[number])),
  );
  return JSON.stringify({
    title: post.title, slug: post.slug, content: post.content, excerpt: post.excerpt,
    status: post.status, categories: post.categories, tags: post.tags,
    featuredMedia: post.featuredMedia, meta: protectedMeta,
  });
}

/**
 * Distributes one movie to one site, updating that (movie, site) Distribution
 * row only — unlike distributeMovie(), it never touches Movie.status, so
 * callers that need to sync a single movie to a single additional site (e.g.
 * backfilling a newly-added TargetSite) can reuse this without disturbing a
 * movie's overall DONE/PARTIAL/FAILED state. Exported for src/lib/site-sync/job-runner.ts.
 */
export async function distributeToSite(
  movie: MovieWithTags,
  site: TargetSite,
  mode: DistributionWriteMode = "video_only",
): Promise<DistributionResult> {
  const publishedTitle = mergeContent(movie).title;
  const distribution = await prisma.distribution.upsert({
    where: { movieId_siteId: { movieId: movie.id, siteId: site.id } },
    update: { status: "PROCESSING", attempts: { increment: 1 } },
    create: { movieId: movie.id, siteId: site.id, status: "PROCESSING", attempts: 1 },
  });

  let createdPost: WpPost | undefined;
  try {
    const credential = decrypt({
      ciphertext: site.credentialEnc,
      iv: site.credentialIv,
      tag: site.credentialTag,
    });

    const client = new WordPressClient({
      baseUrl: site.baseUrl,
      authType: site.authType,
      username: site.wpUsername,
      credential,
      postType: site.postType,
      categoryRestBase: site.categoryRestBase,
      tagRestBase: site.tagRestBase,
    });

    // The dashboard's saved health flag can be months old. Verify the same
    // credential immediately before distribution so an expired/revoked
    // Application Password is reported as an authentication failure instead
    // of being obscured by a later post-status scan error.
    try {
      await client.ping();
      await prisma.targetSite.update({ where: { id: site.id }, data: { healthStatus: "OK", lastCheckedAt: new Date() } });
    } catch (error) {
      await prisma.targetSite.update({ where: { id: site.id }, data: { healthStatus: "ERROR", lastCheckedAt: new Date() } });
      throw error;
    }

    let existingPostId = distribution.remotePostId ? Number(distribution.remotePostId) : null;
    if (!existingPostId) {
      const recovered = await client.findPostByAurumMovieId(movie.id);
      if (recovered) existingPostId = recovered.id;
    }
    let payload: Record<string, unknown>;
    let warnings: string[] = [];
    let protectedBefore: string | null = null;
    if (existingPostId && Number.isInteger(existingPostId) && existingPostId > 0) {
      const remote = await client.getPost(existingPostId);
      const remoteMovieId = typeof remote.meta.aurum_movie_id === "string"
        ? remote.meta.aurum_movie_id.trim()
        : "";
      if (remoteMovieId && remoteMovieId !== movie.id) {
        throw new Error("wordpress_identity_conflict");
      }
      // A missing WordPress identity is recoverable only when this exact
      // (movie, site) Distribution already owns the remote post id. The id is
      // captured directly from WordPress's create response, including legacy
      // creates whose metadata verification later failed. This deliberately
      // does not use title, slug, URL, or content matching.
      if (!remoteMovieId && !distribution.remotePostId) {
        throw new Error("wordpress_identity_missing");
      }
      if (mode === "video_only") {
        if (distribution.errorMessage?.startsWith("wordpress_seo_")) {
          throw new Error("wordpress_seo_retry_requires_editorial_mode");
        }
        protectedBefore = protectedSnapshot(remote);
        payload = videoOnlyPayload(movie, await resolveIframeUrl(movie));
      } else {
        ({ payload, warnings } = await buildPayload(client, movie, site));
      }
      createdPost = await client.updatePost(existingPostId, payload);
    } else {
      const built = await buildPayload(client, movie, site);
      payload = built.payload;
      warnings.push(...built.warnings);
      createdPost = await client.createPost(payload);
    }
    const sentMeta = payload.meta as Record<string, unknown>;
    const expectedMeta = Object.fromEntries(
      AURUM_VIDEO_META_KEYS.map((key) => [key, String(sentMeta[key] ?? "")]),
    ) as AurumVideoMeta;
    const verified = await client.verifyVideoMeta(createdPost.id, expectedMeta);
    if (protectedBefore !== null && protectedSnapshot(verified) !== protectedBefore) {
      throw new Error("wordpress_protected_fields_changed");
    }
    const post = createdPost;

    await prisma.distribution.update({
      where: { movieId_siteId: { movieId: movie.id, siteId: site.id } },
      data: {
        status: "SUCCESS",
        remotePostId: String(post.id),
        remotePostUrl: post.link,
        errorMessage: null,
        distributedAt: new Date(),
      },
    });

    return { siteId: site.id, site: site.name, status: "success", title: verified.title || publishedTitle,
      postId: post.id, url: post.link, ...(warnings.length ? { warnings } : {}) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown distribution error";
    const retryable = isTransientDistributionError(err);
    await prisma.distribution.update({
      where: { movieId_siteId: { movieId: movie.id, siteId: site.id } },
      data: {
        status: "FAILED",
        errorMessage: message.slice(0, 1000),
        ...(createdPost
          ? { remotePostId: String(createdPost.id), remotePostUrl: createdPost.link }
          : {}),
      },
    });
    return { siteId: site.id, site: site.name, status: "failed", title: publishedTitle, error: message, retryable,
      ...(createdPost ? { postId: createdPost.id, url: createdPost.link } : {}) };
  }
}

export async function distributeMovie(movieId: string, siteIds: string[], mode: DistributionWriteMode = "video_only"): Promise<DistributeSummary> {
  const movie = await prisma.movie.findUnique({ where: { id: movieId }, include: { tags: true, actors: { select: ACTOR_SYNC_SELECT } } });
  if (!movie) throw new Error("Movie not found");

  const sites = await prisma.targetSite.findMany({ where: { id: { in: siteIds }, isActive: true } });
  if (!sites.length) throw new Error("No active destination sites found for the given siteIds");

  await prisma.movie.update({ where: { id: movieId }, data: { status: "PUBLISHING" } });

  // A large simultaneous burst to WordPress sites that share hosting/database
  // resources caused intermittent HTTP 500 and database-connection failures.
  // Keep sites independent, but publish only a few at a time.
  const settled = await mapWithConcurrency(
    sites,
    SITE_DISTRIBUTION_CONCURRENCY,
    site => distributeToSite(movie, site, mode),
  );
  const results = settled.map((r, index) =>
    r.status === "fulfilled" ? r.value : ({
      siteId: sites[index]?.id ?? "unknown", site: sites[index]?.name ?? "Unknown site", status: "failed", title: movie.title,
      error: r.reason?.message ?? "Unknown error",
    } as DistributionResult),
  );

  // Retry one time only for failures that are safe and likely temporary. The
  // second pass uses the normal aurum_movie_id reconciliation in
  // distributeToSite(), so a lost create response is recovered as an update
  // instead of blindly creating a duplicate WordPress post.
  const retryIndexes = results
    .map((result, index) => result.status === "failed" && result.retryable ? index : -1)
    .filter(index => index >= 0);
  if (retryIndexes.length) {
    await new Promise(resolve => setTimeout(resolve, TRANSIENT_RETRY_DELAY_MS));
    const retried = await mapWithConcurrency(
      retryIndexes,
      SITE_DISTRIBUTION_CONCURRENCY,
      index => distributeToSite(movie, sites[index]!, "overwrite_editorial"),
    );
    retried.forEach((retry, retryIndex) => {
      const resultIndex = retryIndexes[retryIndex]!;
      results[resultIndex] = retry.status === "fulfilled" ? retry.value : ({
        siteId: sites[resultIndex]?.id ?? "unknown",
        site: sites[resultIndex]?.name ?? "Unknown site",
        status: "failed",
        title: movie.title,
        error: retry.reason?.message ?? "Unknown error",
      } as DistributionResult);
    });
  }

  const successCount = results.filter((r) => r.status === "success").length;
  const finalStatus = successCount === 0 ? "failed" : successCount === results.length ? "done" : "partial";
  await prisma.movie.update({ where: { id: movieId }, data: { status: finalStatus.toUpperCase() as "DONE" | "PARTIAL" | "FAILED" } });
  await invalidatePublicMovieCaches();

  return { movieId, status: finalStatus, summary: { total: results.length, success: successCount }, results };
}
