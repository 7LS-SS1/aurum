import { apiError, jsonOk } from "@/lib/api-response";
import { ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { publishApprovedContentGenerationJob } from "@/lib/content-generation/publish";

export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("MANAGER");
    const limited = await rateLimit(`content-generation-publish-all:${actor.id}`, { limit: 5, windowMs: 60_000 });
    if (!limited.success) throw new ApiError("too_many_requests", 429);
    const { id } = await params;
    const result = await publishApprovedContentGenerationJob(id, actor);
    await logAudit({
      actor,
      action: "content_generation.publish_all",
      resourceType: "ContentGenerationJob",
      resourceId: id,
      metadata: { total: result.total, success: result.success, failed: result.failed },
    });
    return jsonOk(result);
  } catch (error) {
    return apiError(error);
  }
}
