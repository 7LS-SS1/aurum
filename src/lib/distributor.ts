import type { Movie, MovieSiteDraft, TargetSite } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { WordPressClient } from "@/lib/wordpress-client";

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

/** Embeds the video link into post content as a fallback in case `meta.video_url`
 *  isn't registered with `show_in_rest` on the destination site. */
function buildContent(text: string, videoUrl?: string | null): string {
  let html = text;
  if (videoUrl) {
    html += `\n\n<!-- distributed-video -->\n<div class="movie-video"><a href="${videoUrl}" rel="nofollow">▶ ดูหนัง</a></div>`;
  }
  return html;
}

/**
 * Merges the master Movie with its per-site MovieSiteDraft override (if any).
 * The video itself is intentionally never overridable per-site — every
 * destination gets the same underlying file, only text/taxonomy differ.
 */
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

async function buildPayload(client: WordPressClient, movie: Movie, site: TargetSite, draft: MovieSiteDraft | undefined) {
  const merged = mergeContent(movie, draft);

  const payload: Record<string, unknown> = {
    title: merged.title,
    content: buildContent(merged.content || merged.excerpt, movie.videoUrl),
    excerpt: merged.excerpt,
    status: site.defaultStatus || "publish",
    // WordPress only persists `meta` if the destination registered it with
    // show_in_rest=true (or via ACF) — otherwise it's silently dropped, which
    // is why the video link is also embedded in content above as a fallback.
    meta: {
      video_url: movie.videoUrl ?? "",
      video_provider: movie.videoProvider ?? "",
      ...merged.extraMeta,
    },
  };
  if (merged.slug) payload.slug = merged.slug;

  if (movie.thumbnailUrl) {
    try {
      payload.featured_media = await client.uploadMediaFromUrl(movie.thumbnailUrl);
    } catch {
      // A broken thumbnail shouldn't block the whole post from publishing.
    }
  }

  const mainCategory = movie.mainCategory ?? "";
  if (mainCategory || merged.categories.length) {
    payload.categories = await client.resolveCategoryTree(site.categoryRestBase, mainCategory, merged.categories);
  }
  if (merged.tags.length) {
    payload.tags = await client.resolveTerms(site.tagRestBase, merged.tags);
  }

  return payload;
}

async function distributeToSite(
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

/** Distributes one movie to many sites concurrently — one site failing never blocks the others. */
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
