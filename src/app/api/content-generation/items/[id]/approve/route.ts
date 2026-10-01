import { z } from "zod";
import { apiError, jsonOk } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { approveContentGenerationItem } from "@/lib/content-generation/review";

const schema = z.object({
  expectedSourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  expectedDraftFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  draftTitle: z.string().trim().min(1).max(220),
  draftDescription: z.string().trim().min(1).max(1800),
  draftFocusKeyword: z.string().trim().min(1).max(120),
}).strict();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("MANAGER");
    const { id } = await params;
    const body = schema.parse(await req.json());
    const result = await approveContentGenerationItem({ itemId: id, ...body }, actor);
    await logAudit({
      actor,
      action: result.alreadyApproved ? "content_generation.approve_replayed" : "content_generation.approved",
      resourceType: "ContentGenerationItem",
      resourceId: id,
      metadata: { jobId: result.item.jobId, siteId: result.item.siteId, warnings: result.warnings },
    });
    return jsonOk(result);
  } catch (error) {
    return apiError(error);
  }
}
