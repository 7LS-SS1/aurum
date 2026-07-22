import { NextRequest } from "next/server";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { env } from "@/lib/env";
import { syncJobsBatchSchema } from "@/lib/validation";
import { startSyncJobsBatch, listActiveJobs, toPublicJob } from "@/lib/site-sync/job-service";
import { triggerWorkerBestEffort } from "@/lib/site-sync/job-runner";

/**
 * Starts one independent old-video-sync job per requested site — each site
 * gets its own SiteSyncJob row/progress, and one site being invalid/already-
 * active never blocks the others (see startSyncJobsBatch).
 */
export async function POST(req: NextRequest) {
  try {
    const actor = await requireMinRole("MANAGER");
    const { success } = await rateLimit(`sites:sync-batch:${actor.id}`, { limit: 10, windowMs: 60_000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const body = syncJobsBatchSchema.parse(await req.json());
    const results = await startSyncJobsBatch(body.siteIds, actor);

    await logAudit({
      actor,
      action: "site_sync_jobs_batch_started",
      resourceType: "site_sync_job",
      metadata: { siteIds: body.siteIds, created: results.filter((r) => r.created).length },
    });

    if (results.some((r) => r.created)) triggerWorkerBestEffort(req.nextUrl.origin, env().SYSTEM_API_KEY);

    return jsonOk(
      {
        results: results.map((r) => ({ siteId: r.siteId, siteName: r.siteName, created: r.created, job: toPublicJob(r.job) })),
      },
      202,
    );
  } catch (err) {
    return apiError(err);
  }
}

/** All currently active jobs across every site — used to restore UI state (progress bars, toasts) on page load/refresh. */
export async function GET() {
  try {
    await requireMinRole("MANAGER");
    const jobs = await listActiveJobs();
    return jsonOk({ jobs: jobs.map((j) => toPublicJob(j)) });
  } catch (err) {
    return apiError(err);
  }
}
