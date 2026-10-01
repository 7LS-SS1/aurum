import { randomUUID } from "node:crypto";
import { apiError, jsonOk } from "@/lib/api-response";
import { requireSystemKey } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { runContentGenerationWorkerTick, scheduleContentGenerationFollowUp } from "@/lib/content-generation/worker";

export const maxDuration = 300;

async function tick(req: Request) {
  try {
    const actor = requireSystemKey(req);
    const workerId = `${req.headers.get("x-worker-id") ?? "cron"}:${randomUUID()}`;
    const result = await runContentGenerationWorkerTick(workerId);
    await logAudit({ actor, action: "content_generation.worker_tick", resourceType: "ContentGenerationJob", metadata: result });
    scheduleContentGenerationFollowUp(new URL(req.url).origin, env().SYSTEM_API_KEY, result.claimed);
    return jsonOk(result);
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(req: Request) {
  return tick(req);
}

export async function POST(req: Request) {
  return tick(req);
}
