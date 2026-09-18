import { NextRequest } from "next/server";
import { z } from "zod";
import { requireMinRole } from "@/lib/authz";
import { apiError, ApiError, jsonOk } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { getRepairOverview, startRepairJobs } from "@/lib/site-sync/repair-service";
import { triggerWorkerBestEffort } from "@/lib/site-sync/job-runner";

const schema = z.object({
  siteIds: z.array(z.string().min(1).max(100)).min(1).max(50),
  mode: z.enum(["video_only", "overwrite_editorial"]).default("video_only"),
});

export async function GET() {
  try { await requireMinRole("MANAGER"); return jsonOk(await getRepairOverview()); }
  catch (error) { return apiError(error); }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireMinRole("MANAGER");
    if (!(await rateLimit(`distribution-repair:${actor.id}`, { limit: 5, windowMs: 60_000 })).success) throw new ApiError("too_many_requests", 429);
    const { siteIds, mode } = schema.parse(await req.json());
    const results = await startRepairJobs(siteIds, actor, mode);
    await logAudit({ actor, action: "distribution_repair_started", resourceType: "site_sync_job", metadata: {
      mode, results: results.map(row => ({ siteId: row.siteId, created: row.created, queued: row.queued, error: row.error })),
    } });
    if (results.some(row => row.created)) triggerWorkerBestEffort(req.nextUrl.origin, env().SYSTEM_API_KEY);
    return jsonOk({ results }, 202);
  } catch (error) { return apiError(error); }
}
