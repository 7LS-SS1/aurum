import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-response";
import type { Actor } from "@/lib/authz";
import { canDistributeMovie } from "@/lib/distribution-policy";
import { ACTOR_SYNC_SELECT, distributeToSite, type DistributionResult } from "@/lib/distributor";
import { currentMovieSource } from "./job-service";
import { sourceFingerprint } from "./fingerprints";

export interface ContentGenerationPublishResult {
  itemId: string;
  movieId: string;
  siteId: string;
  status: "success" | "failed";
  alreadyPublished?: boolean;
  postId?: number;
  url?: string;
  error?: string;
}

async function writePublishLog(input: {
  jobId: string;
  itemId: string;
  level?: "INFO" | "WARN" | "ERROR";
  event: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.contentGenerationJobLog.create({
    data: {
      jobId: input.jobId,
      itemId: input.itemId,
      level: input.level ?? "INFO",
      event: input.event,
      message: input.message,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export async function publishContentGenerationItem(
  input: { itemId: string; expectedSourceFingerprint?: string; expectedDraftFingerprint?: string },
  actor: Actor,
): Promise<ContentGenerationPublishResult> {
  const item = await prisma.contentGenerationItem.findUnique({
    where: { id: input.itemId },
    include: {
      movie: { include: { tags: true, actors: { select: ACTOR_SYNC_SELECT } } },
      site: true,
    },
  });
  if (!item) throw new ApiError("content_generation_item_not_found", 404);
  if (item.status !== "APPROVED") throw new ApiError("content_generation_item_not_approved", 409);
  if (!item.draftTitle || !item.draftDescription || !item.draftFocusKeyword || !item.draftFingerprint) {
    throw new ApiError("content_generation_approved_draft_incomplete", 409);
  }
  if (input.expectedSourceFingerprint && input.expectedSourceFingerprint !== item.sourceFingerprint) {
    throw new ApiError("source_fingerprint_mismatch", 409);
  }
  if (input.expectedDraftFingerprint && input.expectedDraftFingerprint !== item.draftFingerprint) {
    throw new ApiError("draft_fingerprint_mismatch", 409);
  }
  if (!canDistributeMovie(item.movie.status, actor.role)) {
    throw new ApiError(`cannot_publish_from_${item.movie.status.toLowerCase()}`, 409);
  }
  if (!item.site.isActive) throw new ApiError("destination_site_inactive", 409);

  if (item.publishStatus === "PUBLISHED") {
    return {
      itemId: item.id,
      movieId: item.movieId,
      siteId: item.siteId,
      status: "success",
      alreadyPublished: true,
      ...(item.publishedPostId ? { postId: Number(item.publishedPostId) } : {}),
      ...(item.publishedPostUrl ? { url: item.publishedPostUrl } : {}),
    };
  }

  const currentFingerprint = sourceFingerprint(await currentMovieSource(item.movieId));
  if (currentFingerprint !== item.sourceFingerprint) throw new ApiError("source_changed_since_generation", 409);

  const now = new Date();
  const staleBefore = new Date(now.getTime() - 10 * 60_000);
  const claimed = await prisma.contentGenerationItem.updateMany({
    where: {
      id: item.id,
      status: "APPROVED",
      draftFingerprint: item.draftFingerprint,
      OR: [
        { publishStatus: { in: ["NOT_PUBLISHED", "FAILED"] } },
        { publishStatus: "PUBLISHING", publishAttemptedAt: { lt: staleBefore } },
      ],
    },
    data: {
      publishStatus: "PUBLISHING",
      publishAttemptedAt: now,
      publishError: null,
    },
  });
  if (claimed.count !== 1) throw new ApiError("content_generation_item_publish_in_progress", 409);

  await writePublishLog({
    jobId: item.jobId,
    itemId: item.id,
    event: "item_publish_started",
    message: `เริ่มเผยแพร่ draft ไป ${item.site.name}`,
  });

  let result: DistributionResult;
  try {
    result = await distributeToSite(item.movie, item.site, "overwrite_editorial", {
      title: item.draftTitle,
      description: item.draftDescription,
      focusKeyword: item.draftFocusKeyword,
    });
  } catch (error) {
    result = {
      siteId: item.siteId,
      site: item.site.name,
      title: item.draftTitle,
      status: "failed",
      error: error instanceof Error ? error.message : "content_generation_publish_failed",
    };
  }

  if (result.status === "success") {
    const publishedAt = new Date();
    await prisma.contentGenerationItem.update({
      where: { id: item.id },
      data: {
        publishStatus: "PUBLISHED",
        publishError: null,
        publishedById: actor.id,
        publishedAt,
        publishedPostId: result.postId ? String(result.postId) : null,
        publishedPostUrl: result.url ?? null,
      },
    });
    await writePublishLog({
      jobId: item.jobId,
      itemId: item.id,
      event: "item_published",
      message: `เผยแพร่ไป ${item.site.name} สำเร็จ`,
      metadata: { postId: result.postId, url: result.url, actorId: actor.id },
    });
  } else {
    await prisma.contentGenerationItem.update({
      where: { id: item.id },
      data: { publishStatus: "FAILED", publishError: (result.error ?? "content_generation_publish_failed").slice(0, 1000) },
    });
    await writePublishLog({
      jobId: item.jobId,
      itemId: item.id,
      level: "ERROR",
      event: "item_publish_failed",
      message: `เผยแพร่ไป ${item.site.name} ไม่สำเร็จ`,
      metadata: { error: result.error },
    });
  }

  return {
    itemId: item.id,
    movieId: item.movieId,
    siteId: item.siteId,
    status: result.status,
    ...(result.postId ? { postId: result.postId } : {}),
    ...(result.url ? { url: result.url } : {}),
    ...(result.error ? { error: result.error } : {}),
  };
}

export async function publishApprovedContentGenerationJob(jobId: string, actor: Actor) {
  const job = await prisma.contentGenerationJob.findUnique({ where: { id: jobId }, select: { id: true } });
  if (!job) throw new ApiError("content_generation_job_not_found", 404);
  const items = await prisma.contentGenerationItem.findMany({
    where: { jobId, status: "APPROVED", publishStatus: { in: ["NOT_PUBLISHED", "FAILED"] } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });

  const results = new Array<ContentGenerationPublishResult>(items.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      try {
        results[index] = await publishContentGenerationItem({ itemId: items[index]!.id }, actor);
      } catch (error) {
        results[index] = {
          itemId: items[index]!.id,
          movieId: "",
          siteId: "",
          status: "failed",
          error: error instanceof Error ? error.message : "content_generation_publish_failed",
        };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, items.length) }, () => worker()));
  const success = results.filter(result => result.status === "success").length;
  return { total: results.length, success, failed: results.length - success, results };
}
