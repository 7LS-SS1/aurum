import type { MovieStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { distributeToSite } from "@/lib/distributor";

/**
 * Movies eligible to be backfilled into a newly-added TargetSite. Deliberately
 * narrower than "not draft" — excludes REJECTED/ARCHIVED/FAILED/in-review
 * states too, matching the "approved/published/ready only" requirement:
 *   - APPROVED: reviewed and ready, just hasn't gone out to any site yet.
 *   - DONE / PARTIAL: already live on at least one other site — exactly the
 *     "old clip, new destination" case this feature exists for.
 * FAILED is excluded on purpose even though the content itself may be fine —
 * it means every site distribution attempt for this movie failed, and this
 * feature is for backfilling healthy content, not retrying broken jobs (the
 * existing "ลองใหม่" retry button in VideosManager already covers that).
 */
export const ELIGIBLE_BACKFILL_STATUSES: MovieStatus[] = ["APPROVED", "DONE", "PARTIAL"];

export interface BackfillJobsResult {
  eligible: number;
  created: number;
  skipped: number;
}

/**
 * Creates PENDING Distribution rows for every eligible movie that doesn't
 * already have one for this site. Idempotent by construction: Distribution's
 * existing @@unique([movieId, siteId]) means a movie that already has ANY
 * row for this site (PENDING/SUCCESS/FAILED/...) is skipped, not duplicated —
 * calling this twice in a row for the same site is a safe no-op the second
 * time. Does not touch Movie.status or create/post anything itself; a
 * separate batch step (processPendingDistributions) does the actual posting.
 */
export async function createBackfillJobs(siteId: string): Promise<BackfillJobsResult> {
  const eligibleMovies = await prisma.movie.findMany({
    where: { status: { in: ELIGIBLE_BACKFILL_STATUSES } },
    select: { id: true },
  });

  if (!eligibleMovies.length) {
    return { eligible: 0, created: 0, skipped: 0 };
  }

  const { count } = await prisma.distribution.createMany({
    data: eligibleMovies.map((movie) => ({ movieId: movie.id, siteId, status: "PENDING" as const })),
    skipDuplicates: true,
  });

  return { eligible: eligibleMovies.length, created: count, skipped: eligibleMovies.length - count };
}

export interface ProcessDistributionsResult {
  processed: number;
  success: number;
  failed: number;
}

/**
 * Batch-processes up to `limit` PENDING Distribution rows (from any source —
 * in practice, almost always createBackfillJobs() above, since the normal
 * upload/publish flow processes its own rows synchronously within the same
 * request and never leaves them sitting at PENDING). Reuses distributeToSite
 * from distributor.ts as-is, so retries/error handling/audit-worthy fields
 * (remotePostId, errorMessage, attempts) all behave exactly like the existing
 * publish flow — this is not a parallel/duplicate implementation.
 */
export async function processPendingDistributions(limit: number): Promise<ProcessDistributionsResult> {
  const pending = await prisma.distribution.findMany({
    where: { status: "PENDING" },
    take: limit,
    orderBy: { createdAt: "asc" },
    include: { movie: true, site: true },
  });

  let success = 0;
  let failed = 0;

  for (const row of pending) {
    const draft = await prisma.movieSiteDraft.findUnique({
      where: { movieId_siteId: { movieId: row.movieId, siteId: row.siteId } },
    });
    const result = await distributeToSite(row.movie, row.site, draft ?? undefined);
    if (result.status === "success") success += 1;
    else failed += 1;
  }

  return { processed: pending.length, success, failed };
}
