import { NextRequest } from "next/server";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { jobLogsQuerySchema } from "@/lib/validation";
import { getJob, listJobLogs, toPublicJob } from "@/lib/site-sync/job-service";

/**
 * Job detail + an incremental page of its logs. `afterId`/`limit` let the
 * UI's polling loop fetch only new log lines instead of the whole history on
 * every tick — see src/lib/site-sync/job-service.ts#listJobLogs.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    await requireMinRole("MANAGER");
    const { jobId } = await params;

    const job = await getJob(jobId);
    if (!job) throw new ApiError("job_not_found", 404);

    const query = jobLogsQuerySchema.parse({
      afterId: req.nextUrl.searchParams.get("afterId") ?? undefined,
      limit: req.nextUrl.searchParams.get("limit") ?? undefined,
    });
    const logs = await listJobLogs(jobId, query);

    return jsonOk({ job: toPublicJob(job), logs });
  } catch (err) {
    return apiError(err);
  }
}
