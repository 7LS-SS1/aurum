import type { Actor, Movie, MovieSiteDraft, Tag, TargetSite } from "@prisma/client";
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
  postId?: number;
  url?: string;
  error?: string;
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

/** Movie.tags/actors are real relations now — every caller that touches merged content needs them eagerly loaded. */
export type MovieWithTags = Movie & { tags: Pick<Tag, "name">[]; actors: MovieActor[] };

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
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

function mergeContent(movie: MovieWithTags, draft: MovieSiteDraft | undefined) {
  const extraMeta = (movie.extraMeta as Record<string, unknown>) ?? {};
  const draftExtraMeta = (draft?.extraMeta as Record<string, unknown> | null) ?? {};
  return {
    title: draft?.title ?? movie.title,
    slug: draft?.slug ?? movie.slug ?? undefined,
    excerpt: draft?.excerpt ?? movie.excerpt ?? "",
    content: draft?.content ?? movie.content ?? "",
    categories: draft?.categories ? asStringArray(draft.categories) : asStringArray(movie.categories),
    tags: draft?.tags ? asStringArray(draft.tags) : movie.tags.map((t) => t.name),
    extraMeta: { ...extraMeta, ...draftExtraMeta },
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
async function syncMovieActors(client: WordPressClient, actors: MovieActor[], siteId: string): Promise<number[]> {
  const termIds: number[] = [];
  for (const actor of actors) {
    try {
      const payload = actorPayload(actor);
      const remote = await client.syncActor(payload);
      if (remote.status !== "existing") {
        await prisma.$executeRaw`INSERT INTO actor_syncs (actor_id, site_id, remote_id, term_id, payload_hash, synced_at)
          VALUES (${actor.id}, ${siteId}, ${remote.remoteId}, ${remote.termId ?? null}, ${actorFingerprint(payload)}, NOW())
          ON CONFLICT (actor_id, site_id) DO UPDATE SET remote_id = EXCLUDED.remote_id,
          term_id = EXCLUDED.term_id, payload_hash = EXCLUDED.payload_hash, synced_at = EXCLUDED.synced_at`;
      }
      if (remote.termId) termIds.push(remote.termId);
    } catch {
      // Skip this actor; the video still publishes with the actors that did sync.
    }
  }
  return termIds;
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

async function buildPayload(client: WordPressClient, movie: MovieWithTags, site: TargetSite, draft: MovieSiteDraft | undefined) {
  const merged = mergeContent(movie, draft);
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

  return payload;
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
  draft: MovieSiteDraft | undefined,
  mode: DistributionWriteMode = "video_only",
): Promise<DistributionResult> {
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

    let existingPostId = distribution.remotePostId ? Number(distribution.remotePostId) : null;
    if (!existingPostId) {
      const recovered = await client.findPostByAurumMovieId(movie.id);
      if (recovered) existingPostId = recovered.id;
    }
    let payload: Record<string, unknown>;
    let protectedBefore: string | null = null;
    if (existingPostId && Number.isInteger(existingPostId) && existingPostId > 0) {
      const remote = await client.getPost(existingPostId);
      const remoteMovieId = typeof remote.meta.aurum_movie_id === "string"
        ? remote.meta.aurum_movie_id.trim()
        : "";
      if (remoteMovieId && remoteMovieId !== movie.id) {
        throw new Error("wordpress_identity_conflict");
      }
      // A missing WordPress identity is recoverable only from a previously
      // verified success for this exact (movie, site, remote post) tuple.
      // `distributedAt` is written only after verifyVideoMeta() succeeds.
      // This deliberately does not use title, slug, URL, or content matching.
      if (!remoteMovieId && (!distribution.remotePostId || !distribution.distributedAt)) {
        throw new Error("wordpress_identity_missing");
      }
      if (mode === "video_only") {
        protectedBefore = protectedSnapshot(remote);
        payload = videoOnlyPayload(movie, await resolveIframeUrl(movie));
      } else {
        payload = await buildPayload(client, movie, site, draft);
      }
      createdPost = await client.updatePost(existingPostId, payload);
    } else {
      payload = await buildPayload(client, movie, site, draft);
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

    return { siteId: site.id, site: site.name, status: "success", postId: post.id, url: post.link };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown distribution error";
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
    return { siteId: site.id, site: site.name, status: "failed", error: message };
  }
}

export async function distributeMovie(movieId: string, siteIds: string[], mode: DistributionWriteMode = "video_only"): Promise<DistributeSummary> {
  const movie = await prisma.movie.findUnique({ where: { id: movieId }, include: { tags: true, actors: { select: ACTOR_SYNC_SELECT } } });
  if (!movie) throw new Error("Movie not found");

  const [sites, drafts] = await Promise.all([
    prisma.targetSite.findMany({ where: { id: { in: siteIds }, isActive: true } }),
    prisma.movieSiteDraft.findMany({ where: { movieId, siteId: { in: siteIds } } }),
  ]);
  if (!sites.length) throw new Error("No active destination sites found for the given siteIds");

  const draftBySite = new Map(drafts.map((d) => [d.siteId, d]));

  await prisma.movie.update({ where: { id: movieId }, data: { status: "PUBLISHING" } });

  const settled = await Promise.allSettled(sites.map((site) => distributeToSite(movie, site, draftBySite.get(site.id), mode)));
  const results = settled.map((r) =>
    r.status === "fulfilled" ? r.value : ({ status: "failed", error: r.reason?.message ?? "Unknown error" } as DistributionResult),
  );

  const successCount = results.filter((r) => r.status === "success").length;
  const finalStatus = successCount === 0 ? "failed" : successCount === results.length ? "done" : "partial";
  await prisma.movie.update({ where: { id: movieId }, data: { status: finalStatus.toUpperCase() as "DONE" | "PARTIAL" | "FAILED" } });
  await invalidatePublicMovieCaches();

  return { movieId, status: finalStatus, summary: { total: results.length, success: successCount }, results };
}
