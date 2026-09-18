import type { MovieStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-response";
import type { Actor } from "@/lib/authz";
import { ACTIVE_JOB_STATUSES, startSyncJob, toPublicJob } from "./job-service";
import { invalidatePublicMovieCaches } from "@/lib/cache";

// Never let a bulk repair publish a draft, rejected, archived or in-review movie.
export const REPAIR_STATUSES: MovieStatus[] = ["APPROVED", "DONE", "PARTIAL", "FAILED"];
export const MAX_REPAIR_MOVIES = 500;

export async function refreshRepairedMovieStatus(movieId: string) {
  // Serialize repairs from different sites before computing the movie-wide
  // result. Never mark a movie DONE from just the one site being retried.
  const changed = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${movieId}))`;
    const movie = await tx.movie.findUnique({ where: { id: movieId }, select: { status: true, targetSiteIds: true } });
    if (!movie || !["FAILED", "PARTIAL", "DONE"].includes(movie.status)) return false;
    const rows = await tx.distribution.findMany({ where: { movieId }, select: { siteId: true, status: true } });
    if (!rows.length || rows.some(row => row.status === "PENDING" || row.status === "PROCESSING")) return false;
    const targets = Array.isArray(movie.targetSiteIds) ? movie.targetSiteIds.filter((id): id is string => typeof id === "string") : [];
    const success = rows.filter(row => row.status === "SUCCESS");
    const complete = success.length === rows.length && targets.every(id => success.some(row => row.siteId === id));
    const status = complete ? "DONE" : success.length ? "PARTIAL" : "FAILED";
    return (await tx.movie.updateMany({ where: { id: movieId, status: { in: ["FAILED", "PARTIAL", "DONE"] } }, data: { status } })).count > 0;
  });
  if (changed) await invalidatePublicMovieCaches();
}

export async function getRepairOverview() {
  const [sites, failed, eligible, activeJobs] = await Promise.all([
    prisma.targetSite.findMany({ select: { id: true, name: true, isActive: true, healthStatus: true }, orderBy: { name: "asc" } }),
    prisma.distribution.groupBy({ by: ["siteId"], where: { status: "FAILED" }, _count: { _all: true } }),
    prisma.distribution.groupBy({ by: ["siteId"], where: { status: "FAILED", movie: { status: { in: REPAIR_STATUSES } } }, _count: { _all: true } }),
    prisma.siteSyncJob.findMany({ where: { status: { in: ACTIVE_JOB_STATUSES } } }),
  ]);
  return {
    sites: sites.map(site => ({
      ...site,
      failed: failed.find(row => row.siteId === site.id)?._count._all ?? 0,
      eligible: eligible.find(row => row.siteId === site.id)?._count._all ?? 0,
      job: activeJobs.find(job => job.siteId === site.id) ? toPublicJob(activeJobs.find(job => job.siteId === site.id)!) : null,
    })),
    limitPerSite: MAX_REPAIR_MOVIES,
  };
}

export async function startRepairJobs(siteIds: string[], actor: Actor, mode: "video_only" | "overwrite_editorial") {
  const results = [];
  // Keep partial batch success explicit: one unavailable site cannot hide jobs created for others.
  for (const siteId of [...new Set(siteIds)]) {
    try {
      const site = await prisma.targetSite.findUnique({ where: { id: siteId }, select: { isActive: true } });
      if (!site) throw new ApiError("site_not_found", 404);
      if (!site.isActive) throw new ApiError("site_inactive", 409);
      const rows = await prisma.distribution.findMany({
        where: { siteId, status: "FAILED", movie: { status: { in: REPAIR_STATUSES } } },
        select: { movieId: true }, orderBy: { updatedAt: "asc" }, take: MAX_REPAIR_MOVIES,
      });
      if (!rows.length) { results.push({ siteId, created: false, queued: 0, job: null, error: null }); continue; }
      const { created, job } = await startSyncJob(siteId, actor, { repair: true, mode, pushQueue: rows.map(row => row.movieId) });
      results.push({ siteId, created, queued: created ? rows.length : 0, job: toPublicJob(job), error: created ? null : "site_job_already_active" });
    } catch (error) {
      results.push({ siteId, created: false, queued: 0, job: null, error: error instanceof ApiError ? error.message : "repair_start_failed" });
    }
  }
  return results;
}
