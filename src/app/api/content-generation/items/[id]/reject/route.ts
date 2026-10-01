import { z } from "zod";
import { apiError, jsonOk } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { rejectContentGenerationItem } from "@/lib/content-generation/review";

const schema = z.object({
  expectedSourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  expectedDraftFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().trim().min(1).max(1000),
}).strict();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("MANAGER");
    const { id } = await params;
    const body = schema.parse(await req.json());
    const result = await rejectContentGenerationItem({ itemId: id, ...body }, actor);
    await logAudit({
      actor,
      action: result.alreadyRejected ? "content_generation.reject_replayed" : "content_generation.rejected",
      resourceType: "ContentGenerationItem",
      resourceId: id,
      metadata: { jobId: result.item.jobId, siteId: result.item.siteId },
    });
    return jsonOk(result);
  } catch (error) {
    return apiError(error);
  }
}
