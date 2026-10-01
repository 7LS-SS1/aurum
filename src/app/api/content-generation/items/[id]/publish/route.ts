import { z } from "zod";
import { ApiError, apiError, jsonOk } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { publishContentGenerationItem } from "@/lib/content-generation/publish";

export const maxDuration = 300;

const schema = z.object({
  expectedSourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  expectedDraftFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("MANAGER");
    const limited = await rateLimit(`content-generation-publish:${actor.id}`, { limit: 20, windowMs: 60_000 });
    if (!limited.success) throw new ApiError("too_many_requests", 429);
    const { id } = await params;
    const body = schema.parse(await req.json());
    const result = await publishContentGenerationItem({ itemId: id, ...body }, actor);
    await logAudit({
      actor,
      action: result.status === "success" ? "content_generation.published" : "content_generation.publish_failed",
      resourceType: "ContentGenerationItem",
      resourceId: id,
      metadata: { ...result },
    });
    return jsonOk({ result });
  } catch (error) {
    return apiError(error);
  }
}
