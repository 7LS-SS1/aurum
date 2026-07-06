import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { WordPressClient } from "@/lib/wordpress-client";

export interface SyncWpEngagementOptions {
  movieId?: string;
  take?: number;
}

export interface SyncWpEngagementResult {
  scanned: number;
  success: number;
  failed: number;
  moviesUpdated: number;
  results: Array<{
    distributionId: string;
    movieId: string;
    siteId: string;
    postId: string;
    status: "success" | "failed";
    views?: number;
    error?: string;
  }>;
}

function clampTake(value: number | undefined) {
  return Math.min(Math.max(value ?? 50, 1), 200);
}

function makeClient(site: {
  baseUrl: string;
  authType: "APP_PASSWORD" | "JWT";
  wpUsername: string | null;
  credentialEnc: string;
  credentialIv: string;
  credentialTag: string;
  postType: string;
  categoryRestBase: string;
  tagRestBase: string;
}) {
  const credential = decrypt({
    ciphertext: site.credentialEnc,
    iv: site.credentialIv,
    tag: site.credentialTag,
  });

  return new WordPressClient({
    baseUrl: site.baseUrl,
    authType: site.authType,
    username: site.wpUsername,
    credential,
    postType: site.postType,
    categoryRestBase: site.categoryRestBase,
    tagRestBase: site.tagRestBase,
  });
}

export async function syncWordPressEngagement(options: SyncWpEngagementOptions = {}): Promise<SyncWpEngagementResult> {
  const rows = await prisma.distribution.findMany({
    where: {
      status: "SUCCESS",
      remotePostId: { not: null },
      ...(options.movieId ? { movieId: options.movieId } : {}),
    },
    orderBy: [{ engagementSyncedAt: "asc" }, { updatedAt: "asc" }],
    take: clampTake(options.take),
    include: { site: true },
  });

  const results: SyncWpEngagementResult["results"] = [];
  const touchedMovieIds = new Set<string>();

  for (const row of rows) {
    const postId = row.remotePostId;
    if (!postId) continue;

    try {
      const client = makeClient(row.site);
      const engagement = await client.getAurumEngagement(postId);
      const views = Number.isFinite(engagement.views) ? Math.max(0, Math.floor(engagement.views)) : 0;

      await prisma.distribution.update({
        where: { id: row.id },
        data: {
          remoteViewCount: views,
          engagementSyncedAt: new Date(),
        },
      });

      touchedMovieIds.add(row.movieId);
      results.push({ distributionId: row.id, movieId: row.movieId, siteId: row.siteId, postId, status: "success", views });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown WordPress engagement sync error";
      await prisma.distribution.update({
        where: { id: row.id },
        data: { engagementSyncedAt: new Date() },
      });
      results.push({
        distributionId: row.id,
        movieId: row.movieId,
        siteId: row.siteId,
        postId,
        status: "failed",
        error: message.slice(0, 500),
      });
    }
  }

  for (const movieId of touchedMovieIds) {
    const aggregate = await prisma.distribution.aggregate({
      where: { movieId, status: "SUCCESS" },
      _sum: { remoteViewCount: true },
    });
    await prisma.movie.update({
      where: { id: movieId },
      data: { wpViewCount: aggregate._sum.remoteViewCount ?? 0 },
    });
  }

  return {
    scanned: rows.length,
    success: results.filter((result) => result.status === "success").length,
    failed: results.filter((result) => result.status === "failed").length,
    moviesUpdated: touchedMovieIds.size,
    results,
  };
}
