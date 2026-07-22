import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { cancelJob, toPublicJob } from "@/lib/site-sync/job-service";

export async function POST(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const actor = await requireMinRole("MANAGER");
    const { jobId } = await params;

    const { success } = await rateLimit(`sites:sync-cancel:${actor.id}`, { limit: 20, windowMs: 60_000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const job = await cancelJob(jobId);

    await logAudit({ actor, action: "site_sync_job_cancelled", resourceType: "site_sync_job", resourceId: jobId, metadata: { siteId: job.siteId } });

    return jsonOk({ job: toPublicJob(job) });
  } catch (err) {
    return apiError(err);
  }
}
