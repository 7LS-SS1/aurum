import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { apiError, jsonOk } from "@/lib/api-response";
import { requireSystemKey } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { runWorkerTick, scheduleFollowUpTick } from "@/lib/site-sync/job-runner";

/**
 * Durable driver for old-video-sync jobs — point an external scheduler
 * (Coolify cron, or any hourly-or-more-often job) at this endpoint with
 * `X-System-Key: <SYSTEM_API_KEY>`; see README's Coolify section for the
 * recommended interval. That cron is what actually *guarantees* progress —
 * this same route also self-chains another tick ~1.5s after any tick that
 * claimed work (scheduleFollowUpTick), which is what makes a job finish
 * promptly under normal operation (including local `npm run dev`, with no
 * cron configured at all) instead of waiting out the cron interval for every
 * single batch. If the process restarts mid-chain, the external cron's next
 * tick resumes the job via the same stale-lock recovery as any other crash.
 *
 * Each call claims and advances a bounded number of jobs by one scan/compare
 * or one push-batch step (see job-runner.ts) and returns — it never holds the
 * request open long enough to risk a platform timeout.
 */
async function tick(req: NextRequest) {
  try {
    const actor = requireSystemKey(req);
    const workerId = `${req.headers.get("x-worker-id") ?? "cron"}:${randomUUID()}`;

    const result = await runWorkerTick(workerId);

    await logAudit({ actor, action: "site_sync_worker_tick", resourceType: "site_sync_job", metadata: { ...result } });

    scheduleFollowUpTick(req.nextUrl.origin, env().SYSTEM_API_KEY, result.claimed);

    return jsonOk(result);
  } catch (err) {
    return apiError(err);
  }
}

export async function GET(req: NextRequest) {
  return tick(req);
}

export async function POST(req: NextRequest) {
  return tick(req);
}
