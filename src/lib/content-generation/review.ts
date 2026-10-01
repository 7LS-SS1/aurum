import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-response";
import type { Actor } from "@/lib/authz";
import {
  currentMovieSource,
  refreshContentGenerationJob,
} from "./job-service";
import {
  draftFingerprint,
  normalizeApprovedTitle,
  sourceFingerprint,
} from "./fingerprints";

function validatePlainText(title: string, description: string, focusKeyword: string): void {
  if (/[<>]|https?:\/\//i.test(`${title}\n${description}\n${focusKeyword}`)) throw new ApiError("content_draft_plain_text_required", 422);
}

function hasSourceIdentity(title: string, sourceTitle: string): boolean {
  return normalizeApprovedTitle(title).includes(normalizeApprovedTitle(sourceTitle));
}

export async function approveContentGenerationItem(input: {
  itemId: string;
  expectedSourceFingerprint: string;
  expectedDraftFingerprint: string;
  draftTitle: string;
  draftDescription: string;
  draftFocusKeyword: string;
}, actor: Actor) {
  const item = await prisma.contentGenerationItem.findUnique({ where: { id: input.itemId } });
  if (!item) throw new ApiError("content_generation_item_not_found", 404);
  if (item.status === "APPROVED" && item.draftFingerprint === input.expectedDraftFingerprint) {
    return { item, warnings: [] as string[], alreadyApproved: true };
  }
  if (item.status !== "READY_FOR_REVIEW") throw new ApiError("content_generation_item_not_ready_for_review", 409);
  if (item.sourceFingerprint !== input.expectedSourceFingerprint) throw new ApiError("source_fingerprint_mismatch", 409);
  if (!item.draftFingerprint || item.draftFingerprint !== input.expectedDraftFingerprint) throw new ApiError("draft_fingerprint_mismatch", 409);

  validatePlainText(input.draftTitle, input.draftDescription, input.draftFocusKeyword);
  if (!hasSourceIdentity(input.draftTitle, item.sourceTitle)) throw new ApiError("draft_title_must_preserve_source_identity", 422);
  const currentSourceFingerprint = sourceFingerprint(await currentMovieSource(item.movieId));
  if (currentSourceFingerprint !== item.sourceFingerprint) throw new ApiError("source_changed_since_generation", 409);

  const normalizedTitle = normalizeApprovedTitle(input.draftTitle);
  const [sameSiteItem, sameSitePublished, crossSiteItem, crossSitePublished] = await Promise.all([
    prisma.contentGenerationItem.findFirst({
      where: { id: { not: item.id }, siteId: item.siteId, status: "APPROVED", approvedTitleNormalized: normalizedTitle },
      select: { id: true },
    }),
    prisma.distribution.findFirst({
      where: {
        siteId: item.siteId, status: "SUCCESS", movieId: { not: item.movieId },
        movie: { title: { equals: input.draftTitle, mode: "insensitive" } },
      },
      select: { movieId: true },
    }),
    prisma.contentGenerationItem.findFirst({
      where: { id: { not: item.id }, siteId: { not: item.siteId }, status: "APPROVED", approvedTitleNormalized: normalizedTitle },
      select: { id: true, siteId: true },
    }),
    prisma.distribution.findFirst({
      where: {
        siteId: { not: item.siteId }, status: "SUCCESS", movieId: { not: item.movieId },
        movie: { title: { equals: input.draftTitle, mode: "insensitive" } },
      },
      select: { movieId: true, siteId: true },
    }),
  ]);
  if (sameSiteItem || sameSitePublished) throw new ApiError("duplicate_title_on_destination_site", 409);

  const nextDraftFingerprint = draftFingerprint({
    sourceFingerprint: item.sourceFingerprint,
    title: input.draftTitle,
    description: input.draftDescription,
    focusKeyword: input.draftFocusKeyword,
  });
  const edited = nextDraftFingerprint !== item.draftFingerprint;
  const now = new Date();
  let updated;
  try {
    updated = await prisma.$transaction(async tx => {
      const claimed = await tx.contentGenerationItem.updateMany({
        where: { id: item.id, status: "READY_FOR_REVIEW", draftFingerprint: input.expectedDraftFingerprint },
        data: {
          status: "APPROVED",
          draftTitle: input.draftTitle,
          draftDescription: input.draftDescription,
          draftFocusKeyword: input.draftFocusKeyword,
          draftFingerprint: nextDraftFingerprint,
          approvedTitleNormalized: normalizedTitle,
          reviewedById: actor.id,
          reviewedAt: now,
          approvedById: actor.id,
          approvedAt: now,
          rejectedById: null,
          rejectedAt: null,
          rejectionReason: null,
          ...(edited ? { lastEditedById: actor.id, lastEditedAt: now } : {}),
        },
      });
      if (claimed.count !== 1) throw new ApiError("draft_changed_during_approval", 409);
      await tx.contentGenerationJobLog.create({
        data: {
          jobId: item.jobId,
          itemId: item.id,
          event: "item_approved",
          message: "อนุมัติ draft แล้ว โดยยังไม่เผยแพร่ไป WordPress",
          metadata: { edited, crossSiteDuplicate: Boolean(crossSiteItem || crossSitePublished) },
        },
      });
      return tx.contentGenerationItem.findUniqueOrThrow({ where: { id: item.id } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError("duplicate_title_on_destination_site", 409);
    }
    throw error;
  }
  await refreshContentGenerationJob(item.jobId);
  return {
    item: updated,
    warnings: crossSiteItem || crossSitePublished ? ["duplicate_title_on_another_site"] : [],
    alreadyApproved: false,
  };
}

export async function rejectContentGenerationItem(input: {
  itemId: string;
  expectedSourceFingerprint: string;
  expectedDraftFingerprint: string;
  reason: string;
}, actor: Actor) {
  const item = await prisma.contentGenerationItem.findUnique({ where: { id: input.itemId } });
  if (!item) throw new ApiError("content_generation_item_not_found", 404);
  if (item.status === "REJECTED" && item.draftFingerprint === input.expectedDraftFingerprint) return { item, alreadyRejected: true };
  if (item.status !== "READY_FOR_REVIEW") throw new ApiError("content_generation_item_not_ready_for_review", 409);
  if (item.sourceFingerprint !== input.expectedSourceFingerprint) throw new ApiError("source_fingerprint_mismatch", 409);
  if (!item.draftFingerprint || item.draftFingerprint !== input.expectedDraftFingerprint) throw new ApiError("draft_fingerprint_mismatch", 409);
  if (sourceFingerprint(await currentMovieSource(item.movieId)) !== item.sourceFingerprint) throw new ApiError("source_changed_since_generation", 409);

  const now = new Date();
  const updated = await prisma.$transaction(async tx => {
    const claimed = await tx.contentGenerationItem.updateMany({
      where: { id: item.id, status: "READY_FOR_REVIEW", draftFingerprint: input.expectedDraftFingerprint },
      data: {
        status: "REJECTED",
        reviewedById: actor.id,
        reviewedAt: now,
        rejectedById: actor.id,
        rejectedAt: now,
        rejectionReason: input.reason,
        approvedTitleNormalized: null,
      },
    });
    if (claimed.count !== 1) throw new ApiError("draft_changed_during_rejection", 409);
    await tx.contentGenerationJobLog.create({
      data: { jobId: item.jobId, itemId: item.id, event: "item_rejected", message: "ปฏิเสธ draft", metadata: { reason: input.reason.slice(0, 500) } },
    });
    return tx.contentGenerationItem.findUniqueOrThrow({ where: { id: item.id } });
  });
  await refreshContentGenerationJob(item.jobId);
  return { item: updated, alreadyRejected: false };
}
