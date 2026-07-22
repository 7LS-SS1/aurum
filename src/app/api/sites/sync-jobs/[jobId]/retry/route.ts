import { NextRequest } from "next/server";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { env } from "@/lib/env";
import { retryJob, toPublicJob } from "@/lib/site-sync/job-service";
import { triggerWorkerBestEffort } from "@/lib/site-sync/job-runner";

/** Retrying a FAILED job always starts a brand-new job (fresh WordPress scan), never resumes the old cursor. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const actor = await requireMinRole("MANAGER");
    const { jobId } = await params;

    const { success } = await rateLimit(`sites:sync-retry:${actor.id}`, { limit: 10, windowMs: 60_000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const { created, job } = await retryJob(jobId, actor);

    await logAudit({
      actor,
      action: created ? "site_sync_job_retried" : "site_sync_job_already_active",
      resourceType: "site_sync_job",
      resourceId: job.id,
      metadata: { siteId: job.siteId, retriedFrom: jobId },
    });

    if (created) triggerWorkerBestEffort(req.nextUrl.origin, env().SYSTEM_API_KEY);

    return jsonOk({ created, job: toPublicJob(job) }, created ? 202 : 409);
  } catch (err) {
    return apiError(err);
  }
}
