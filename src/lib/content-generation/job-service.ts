import { Prisma, type ContentGenerationJob, type ContentGenerationJobStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-response";
import type { Actor } from "@/lib/authz";
import { aiProvider, type AiProvider } from "@/lib/ai-provider";
import { readAiConfig } from "@/lib/content-ai";
import {
  itemIdempotencyKey,
  normalizeSourceSnapshot,
  requestFingerprint,
  sourceFingerprint,
  type ContentSourceSnapshot,
} from "./fingerprints";

export const ACTIVE_CONTENT_JOB_STATUSES: ContentGenerationJobStatus[] = ["QUEUED", "PROCESSING"];

export interface StartContentGenerationBatchInput {
  idempotencyKey: string;
  movieIds: string[];
  siteIds: string[];
  provider?: AiProvider;
  trendKeywords: string[];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function sourceForMovie(movie: {
  title: string;
  content: string | null;
  excerpt: string | null;
  mainCategory: string | null;
  categories: unknown;
  tags: { name: string }[];
  actors: { name: string }[];
}): ContentSourceSnapshot {
  return normalizeSourceSnapshot({
    title: movie.title,
    description: movie.content ?? movie.excerpt ?? "",
    categories: [...(movie.mainCategory ? [movie.mainCategory] : []), ...strings(movie.categories)],
    tags: movie.tags.map(tag => tag.name),
    actors: movie.actors.map(actor => actor.name),
  });
}

export async function currentMovieSource(movieId: string): Promise<ContentSourceSnapshot> {
  const movie = await prisma.movie.findUnique({
    where: { id: movieId },
    select: {
      title: true, content: true, excerpt: true, mainCategory: true, categories: true,
      tags: { select: { name: true } }, actors: { select: { name: true } },
    },
  });
  if (!movie) throw new ApiError("movie_not_found", 404);
  return sourceForMovie(movie);
}

export async function startContentGenerationBatch(
  input: StartContentGenerationBatchInput,
  actor: Actor,
): Promise<{ job: ContentGenerationJob; reused: boolean }> {
  const movieIds = [...new Set(input.movieIds)];
  const siteIds = [...new Set(input.siteIds)];
  const combinations = movieIds.length * siteIds.length;
  if (combinations > 500) throw new ApiError("content_generation_batch_too_large", 422);

  const config = await readAiConfig({ requireStorage: true, ...(input.provider ? { provider: input.provider } : {}) });
  if (!config?.enabled) throw new ApiError("content_ai_disabled", 422);
  const provider = aiProvider(config.provider);

  const fingerprint = requestFingerprint({ provider, model: config.model, movieIds, siteIds, trendKeywords: input.trendKeywords });
  const existing = await prisma.contentGenerationJob.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    if (existing.requestFingerprint !== fingerprint) throw new ApiError("idempotency_key_reused_with_different_request", 409);
    return { job: existing, reused: true };
  }

  const [movies, sites] = await Promise.all([
    prisma.movie.findMany({
      where: { id: { in: movieIds } },
      select: {
        id: true, title: true, content: true, excerpt: true, mainCategory: true, categories: true,
        tags: { select: { name: true } }, actors: { select: { name: true } },
      },
    }),
    prisma.targetSite.findMany({ where: { id: { in: siteIds } }, select: { id: true, isActive: true } }),
  ]);
  if (movies.length !== movieIds.length) throw new ApiError("one_or_more_movies_not_found", 404);
  if (sites.length !== siteIds.length) throw new ApiError("one_or_more_sites_not_found", 404);
  if (sites.some(site => !site.isActive)) throw new ApiError("one_or_more_sites_inactive", 409);

  const sourceByMovie = new Map(movies.map(movie => [movie.id, sourceForMovie(movie)]));
  try {
    return await prisma.$transaction(async tx => {
      const job = await tx.contentGenerationJob.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          requestFingerprint: fingerprint,
          provider,
          model: config.model,
          requestedById: actor.id,
          totalItems: combinations,
          cursor: { nextOffset: 0 },
        },
      });
      await tx.contentGenerationItem.createMany({
        data: movieIds.flatMap(movieId => {
          const source = sourceByMovie.get(movieId)!;
          const fingerprintValue = sourceFingerprint(source);
          return siteIds.map(siteId => ({
            jobId: job.id,
            movieId,
            siteId,
            idempotencyKey: itemIdempotencyKey(input.idempotencyKey, movieId, siteId),
            sourceTitle: source.title,
            sourceDescription: source.description,
            sourceCategories: source.categories,
            sourceTags: source.tags,
            sourceActors: source.actors,
            sourceFingerprint: fingerprintValue,
            trendKeywords: input.trendKeywords,
          }));
        }),
      });
      await tx.contentGenerationJobLog.create({
        data: {
          jobId: job.id,
          event: "job_created",
          message: `สร้างคิวเนื้อหา ${combinations} รายการ`,
          metadata: { provider, model: config.model, movies: movieIds.length, sites: siteIds.length },
        },
      });
      return { job, reused: false };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await prisma.contentGenerationJob.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (winner?.requestFingerprint === fingerprint) return { job: winner, reused: true };
      if (winner) throw new ApiError("idempotency_key_reused_with_different_request", 409);
    }
    throw error;
  }
}

export async function getContentGenerationJob(jobId: string) {
  return prisma.contentGenerationJob.findUnique({
    where: { id: jobId },
    include: {
      items: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: { movie: { select: { title: true } }, site: { select: { name: true, baseUrl: true } } },
      },
      logs: { orderBy: { createdAt: "asc" }, take: 200 },
    },
  });
}

export async function listContentGenerationJobs(limit = 30) {
  return prisma.contentGenerationJob.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
    include: { requestedBy: { select: { id: true, name: true, email: true } } },
  });
}

export async function cancelContentGenerationJob(jobId: string): Promise<ContentGenerationJob> {
  return prisma.$transaction(async tx => {
    const cancelled = await tx.contentGenerationJob.updateMany({
      where: { id: jobId, status: { in: ACTIVE_CONTENT_JOB_STATUSES } },
      data: { status: "CANCELLED", phase: "cancelled", finishedAt: new Date() },
    });
    if (cancelled.count !== 1) {
      const exists = await tx.contentGenerationJob.findUnique({ where: { id: jobId }, select: { id: true } });
      throw new ApiError(exists ? "content_generation_job_not_active" : "content_generation_job_not_found", exists ? 409 : 404);
    }
    await tx.contentGenerationJobLog.create({
      data: { jobId, level: "WARN", event: "job_cancelled", message: "ผู้ใช้ยกเลิก Process" },
    });
    return tx.contentGenerationJob.findUniqueOrThrow({ where: { id: jobId } });
  });
}

export async function refreshContentGenerationJob(jobId: string): Promise<void> {
  const job = await prisma.contentGenerationJob.findUnique({ where: { id: jobId }, select: { status: true } });
  if (!job || job.status === "CANCELLED") return;
  const grouped = await prisma.contentGenerationItem.groupBy({
    by: ["status"], where: { jobId }, _count: { _all: true },
  });
  const count = new Map(grouped.map(row => [row.status, row._count._all]));
  const queued = (count.get("QUEUED") ?? 0) + (count.get("GENERATING") ?? 0);
  const ready = count.get("READY_FOR_REVIEW") ?? 0;
  const approved = count.get("APPROVED") ?? 0;
  const rejected = count.get("REJECTED") ?? 0;
  const failed = count.get("FAILED") ?? 0;
  const processed = ready + approved + rejected + failed;
  const total = [...count.values()].reduce((sum, value) => sum + value, 0);
  let status: ContentGenerationJobStatus = "PROCESSING";
  if (queued === 0) status = failed === total ? "FAILED" : failed > 0 ? "PARTIAL_FAILED" : "COMPLETED";

  await prisma.contentGenerationJob.updateMany({
    where: { id: jobId, status: { not: "CANCELLED" } },
    data: {
      status,
      phase: queued > 0 ? "generating" : status.toLowerCase(),
      totalItems: total,
      processedItems: processed,
      readyItems: ready,
      approvedItems: approved,
      rejectedItems: rejected,
      failedItems: failed,
      ...(queued === 0 ? { finishedAt: new Date(), lockedUntil: null, lockedBy: null } : {}),
    },
  });
}
