import type { Movie, MovieSiteDraft, TargetSite } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { WordPressClient } from "@/lib/wordpress-client";
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

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function buildContent(text: string, movie: Movie, iframeUrl?: string): string {
  let html = text;
  if (iframeUrl) {
    html += `\n\n<!-- aurum-video -->\n<div class="aurum-video"><iframe src="${iframeUrl}" loading="lazy" allowfullscreen></iframe></div>`;
  } else if (movie.videoUrl) {
    html += `\n\n<!-- aurum-video -->\n<div class="aurum-video"><a href="${movie.videoUrl}" rel="nofollow">Watch video</a></div>`;
  }
  return html;
}

function mergeContent(movie: Movie, draft: MovieSiteDraft | undefined) {
  const extraMeta = (movie.extraMeta as Record<string, unknown>) ?? {};
  const draftExtraMeta = (draft?.extraMeta as Record<string, unknown> | null) ?? {};
  return {
    title: draft?.title ?? movie.title,
    slug: draft?.slug ?? movie.slug ?? undefined,
    excerpt: draft?.excerpt ?? movie.excerpt ?? "",
    content: draft?.content ?? movie.content ?? "",
    categories: draft?.categories ? asStringArray(draft.categories) : asStringArray(movie.categories),
    tags: draft?.tags ? asStringArray(draft.tags) : asStringArray(movie.tags),
    extraMeta: { ...extraMeta, ...draftExtraMeta },
  };
}

async function resolveIframeUrl(movie: Movie): Promise<string | undefined> {
  if (movie.iframeUrl) return movie.iframeUrl;
  if (movie.videoProvider !== "jwplayer") return undefined;
  return buildJwPlayerIframeUrl(movie.jwPlayerMediaId, await getDefaultJwPlayerConfig());
}

async function buildPayload(client: WordPressClient, movie: Movie, site: TargetSite, draft: MovieSiteDraft | undefined) {
  const merged = mergeContent(movie, draft);
  const iframeUrl = await resolveIframeUrl(movie);

  const payload: Record<string, unknown> = {
    title: merged.title,
    content: buildContent(merged.content || merged.excerpt, movie, iframeUrl),
    excerpt: merged.excerpt,
    status: site.defaultStatus || "publish",
    meta: {
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
      ...merged.extraMeta,
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

  return payload;
}

/**
 * Distributes one movie to one site, updating that (movie, site) Distribution
 * row only — unlike distributeMovie(), it never touches Movie.status, so
 * callers that need to sync a single movie to a single additional site (e.g.
 * backfilling a newly-added TargetSite) can reuse this without disturbing a
 * movie's overall DONE/PARTIAL/FAILED state. Exported for src/lib/site-backfill.ts.
 */
export async function distributeToSite(
  movie: Movie,
  site: TargetSite,
  draft: MovieSiteDraft | undefined,
): Promise<DistributionResult> {
  await prisma.distribution.upsert({
    where: { movieId_siteId: { movieId: movie.id, siteId: site.id } },
    update: { status: "PROCESSING", attempts: { increment: 1 } },
    create: { movieId: movie.id, siteId: site.id, status: "PROCESSING", attempts: 1 },
  });

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

    const payload = await buildPayload(client, movie, site, draft);
    const post = await client.createPost(payload);

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
      data: { status: "FAILED", errorMessage: message.slice(0, 1000) },
    });
    return { siteId: site.id, site: site.name, status: "failed", error: message };
  }
}

export async function distributeMovie(movieId: string, siteIds: string[]): Promise<DistributeSummary> {
  const movie = await prisma.movie.findUnique({ where: { id: movieId } });
  if (!movie) throw new Error("Movie not found");

  const [sites, drafts] = await Promise.all([
    prisma.targetSite.findMany({ where: { id: { in: siteIds }, isActive: true } }),
    prisma.movieSiteDraft.findMany({ where: { movieId, siteId: { in: siteIds } } }),
  ]);
  if (!sites.length) throw new Error("No active destination sites found for the given siteIds");

  const draftBySite = new Map(drafts.map((d) => [d.siteId, d]));

  await prisma.movie.update({ where: { id: movieId }, data: { status: "PUBLISHING" } });

  const settled = await Promise.allSettled(sites.map((site) => distributeToSite(movie, site, draftBySite.get(site.id))));
  const results = settled.map((r) =>
    r.status === "fulfilled" ? r.value : ({ status: "failed", error: r.reason?.message ?? "Unknown error" } as DistributionResult),
  );

  const successCount = results.filter((r) => r.status === "success").length;
  const finalStatus = successCount === 0 ? "failed" : successCount === results.length ? "done" : "partial";
  await prisma.movie.update({ where: { id: movieId }, data: { status: finalStatus.toUpperCase() as "DONE" | "PARTIAL" | "FAILED" } });

  return { movieId, status: finalStatus, summary: { total: results.length, success: successCount }, results };
}
