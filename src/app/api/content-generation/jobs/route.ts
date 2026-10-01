import { z } from "zod";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { AI_PROVIDERS } from "@/lib/ai-provider";
import { listContentGenerationJobs, startContentGenerationBatch } from "@/lib/content-generation/job-service";
import { triggerContentGenerationWorkerBestEffort } from "@/lib/content-generation/worker";

const words = z.array(z.string().trim().min(1).max(100)).max(30).default([]);
const idempotencyKeySchema = z.string().trim().min(8).max(160);
const schema = z.object({
  idempotencyKey: idempotencyKeySchema.optional(),
  movieIds: z.array(z.string().trim().min(1).max(100)).min(1).max(500),
  siteIds: z.array(z.string().trim().min(1).max(100)).min(1).max(500),
  provider: z.enum(AI_PROVIDERS).optional(),
  trendKeywords: words,
}).strict();

export async function POST(req: Request) {
  try {
    const actor = await requireMinRole("MANAGER");
    const body = schema.parse(await req.json());
    const rawIdempotencyKey = req.headers.get("idempotency-key")?.trim() || body.idempotencyKey;
    if (!rawIdempotencyKey) throw new ApiError("idempotency_key_required", 400);
    const idempotencyKey = idempotencyKeySchema.parse(rawIdempotencyKey);
    const { job, reused } = await startContentGenerationBatch({ ...body, idempotencyKey }, actor);
    await logAudit({
      actor,
      action: reused ? "content_generation.batch_reused" : "content_generation.batch_created",
      resourceType: "ContentGenerationJob",
      resourceId: job.id,
      metadata: { provider: job.provider, model: job.model, totalItems: job.totalItems },
    });
    if (!reused) triggerContentGenerationWorkerBestEffort(new URL(req.url).origin, env().SYSTEM_API_KEY);
    return jsonOk({ job, reused }, reused ? 200 : 202);
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(req: Request) {
  try {
    await requireMinRole("MANAGER");
    const rawLimit = Number(new URL(req.url).searchParams.get("limit") ?? 30);
    const jobs = await listContentGenerationJobs(Number.isFinite(rawLimit) ? rawLimit : 30);
    return jsonOk({ jobs });
  } catch (error) {
    return apiError(error);
  }
}
