import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { env } from "@/lib/env";
import { startSyncJob, listJobsForSite, toPublicJob } from "@/lib/site-sync/job-service";
import { triggerWorkerBestEffort } from "@/lib/site-sync/job-runner";

/**
 * Starts (or returns the already-running) old-video-sync job for this site.
 * The actual work — scanning WordPress, comparing against AURUM, pushing
 * missing videos — happens entirely in the background via
 * /api/cron/site-sync-worker, so this responds fast (202) instead of holding
 * the request open. See src/lib/site-sync/job-runner.ts for the full design.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("MANAGER");
    const { id } = await params;

    const { success } = await rateLimit(`sites:sync:${actor.id}`, { limit: 10, windowMs: 60_000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const site = await prisma.targetSite.findUnique({ where: { id } });
    if (!site) throw new ApiError("site_not_found", 404);
    if (!site.isActive) throw new ApiError("site_inactive", 409);

    const { created, job } = await startSyncJob(id, actor);

    await logAudit({
      actor,
      action: created ? "site_sync_job_started" : "site_sync_job_already_active",
      resourceType: "site_sync_job",
      resourceId: job.id,
      metadata: { siteId: id },
    });

    if (created) triggerWorkerBestEffort(req.nextUrl.origin, env().SYSTEM_API_KEY);

    return jsonOk({ created, job: toPublicJob(job) }, created ? 202 : 409);
  } catch (err) {
    return apiError(err);
  }
}

/** Recent jobs for this site — used to restore progress/log state on page refresh. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireMinRole("MANAGER");
    const { id } = await params;
    const jobs = await listJobsForSite(id, 10);
    return jsonOk({ jobs: jobs.map((j) => toPublicJob(j)) });
  } catch (err) {
    return apiError(err);
  }
}
