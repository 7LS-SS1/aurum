import type { MovieStatus, SiteSyncJob, SiteSyncJobStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-response";
import type { Actor } from "@/lib/authz";

/**
 * Movies eligible for old-video-sync — same "approved/published only" bar as
 * the previous site-backfill.ts used, kept here since this module now owns
 * that concern. APPROVED/DONE/PARTIAL: reviewed and either not yet
 * distributed anywhere or already live on at least one other site. FAILED is
 * excluded on purpose: it means every distribution attempt for this movie
 * failed already, which is a "retry" concern, not a "sync to a new/updated
 * site" concern.
 */
export const ELIGIBLE_SYNC_STATUSES: MovieStatus[] = ["APPROVED", "DONE", "PARTIAL"];

export const ACTIVE_JOB_STATUSES: SiteSyncJobStatus[] = ["QUEUED", "SCANNING", "PROCESSING"];

export interface StartJobResult {
  created: boolean;
  job: SiteSyncJob;
}

/**
 * Client-facing shape — deliberately omits `cursor` (an internal checkpoint
 * that can hold thousands of movie ids, no use to the UI), `lockedBy` and
 * `lockedUntil` (worker-claim internals), and `activeSiteId` (a constraint
 * implementation detail, not a real field).
 */
export type PublicSiteSyncJob = Omit<SiteSyncJob, "cursor" | "lockedBy" | "lockedUntil" | "activeSiteId"> & {
  site?: { id: string; name: string };
};

export function toPublicJob(job: SiteSyncJob & { site?: { id: string; name: string } }): PublicSiteSyncJob {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- deliberately stripped, see PublicSiteSyncJob doc comment
  const { cursor, lockedBy, lockedUntil, activeSiteId, ...rest } = job;
  return rest;
}

/**
 * Atomically ensures at most one active job per site. `activeSiteId` carries
 * the site's own id while the job is live and is cleared back to null once it
 * settles — its @unique constraint (schema.prisma) is what makes this a
 * database-level guarantee rather than a JS-level check-then-act race: two
 * concurrent requests for the same site will both attempt to `create` with
 * the same `activeSiteId`, and Postgres's unique index guarantees exactly one
 * of them wins (the loser gets a P2002 and we hand back the winner's job).
 */
export async function startSyncJob(siteId: string, actor: Actor): Promise<StartJobResult> {
  try {
    const job = await prisma.siteSyncJob.create({
      data: {
        siteId,
        requestedById: actor.id,
        status: "QUEUED",
        phase: "queued",
        activeSiteId: siteId,
        cursor: {},
      },
    });
    return { created: true, job };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.siteSyncJob.findFirst({
        where: { siteId, status: { in: ACTIVE_JOB_STATUSES } },
        orderBy: { createdAt: "desc" },
      });
      if (existing) return { created: false, job: existing };
    }
    throw err;
  }
}

export interface BatchStartResult {
  siteId: string;
  siteName: string;
  created: boolean;
  job: SiteSyncJob;
}

/** Starts one independent job per requested site — a failure/conflict on one site never blocks the others. */
export async function startSyncJobsBatch(siteIds: string[], actor: Actor): Promise<BatchStartResult[]> {
  const sites = await prisma.targetSite.findMany({ where: { id: { in: siteIds } } });
  const siteById = new Map(sites.map((s) => [s.id, s]));

  const settled = await Promise.allSettled(
    siteIds.map(async (siteId) => {
      const site = siteById.get(siteId);
      if (!site) throw new ApiError(`site_not_found:${siteId}`, 404);
      if (!site.isActive) throw new ApiError(`site_inactive:${siteId}`, 409);
      const { created, job } = await startSyncJob(siteId, actor);
      return { siteId, siteName: site.name, created, job };
    }),
  );

  return settled.map((result, i) => {
    if (result.status === "fulfilled") return result.value;
    // settled preserves siteIds' order/length one-to-one (Promise.allSettled over a .map of the same array).
    const siteId = siteIds[i] as string;
    throw result.reason instanceof ApiError ? result.reason : new ApiError(`site_sync_start_failed:${siteId}`, 500);
  });
}

export async function listJobsForSite(siteId: string, limit = 10) {
  return prisma.siteSyncJob.findMany({
    where: { siteId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 50),
  });
}

export async function listActiveJobs() {
  return prisma.siteSyncJob.findMany({
    where: { status: { in: ACTIVE_JOB_STATUSES } },
    orderBy: { createdAt: "asc" },
    include: { site: { select: { id: true, name: true } } },
  });
}

export async function getJob(jobId: string) {
  return prisma.siteSyncJob.findUnique({ where: { id: jobId }, include: { site: { select: { id: true, name: true } } } });
}

export interface ListLogsParams {
  afterId?: string;
  limit?: number;
}

/** Paginated (never "dump everything") — the UI's expandable log panel polls this incrementally. */
export async function listJobLogs(jobId: string, { afterId, limit = 50 }: ListLogsParams = {}) {
  const cappedLimit = Math.min(Math.max(limit, 1), 200);
  const cursorClause = afterId ? { id: { gt: afterId } } : {};
  return prisma.siteSyncJobLog.findMany({
    where: { jobId, ...cursorClause },
    orderBy: { createdAt: "asc" },
    take: cappedLimit,
  });
}

export async function cancelJob(jobId: string): Promise<SiteSyncJob> {
  const job = await prisma.siteSyncJob.findUnique({ where: { id: jobId } });
  if (!job) throw new ApiError("job_not_found", 404);
  if (!ACTIVE_JOB_STATUSES.includes(job.status)) throw new ApiError("job_not_active", 409);

  return prisma.siteSyncJob.update({
    where: { id: jobId },
    data: {
      status: "CANCELLED",
      phase: "cancelled",
      finishedAt: new Date(),
      activeSiteId: null,
      lockedUntil: null,
    },
  });
}

/**
 * Retrying always starts a brand-new job rather than resurrecting the failed
 * one's cursor — the whole point of a retry here is a fresh WordPress scan
 * (per the "never trust stale local state alone" requirement), not resuming
 * whatever the previous attempt had partially matched.
 */
export async function retryJob(jobId: string, actor: Actor): Promise<StartJobResult> {
  const job = await prisma.siteSyncJob.findUnique({ where: { id: jobId } });
  if (!job) throw new ApiError("job_not_found", 404);
  if (job.status !== "FAILED") throw new ApiError("job_not_failed", 409);
  return startSyncJob(job.siteId, actor);
}
