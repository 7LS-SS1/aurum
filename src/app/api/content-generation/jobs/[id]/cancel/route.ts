import { apiError, jsonOk } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { cancelContentGenerationJob } from "@/lib/content-generation/job-service";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("MANAGER");
    const { id } = await params;
    const job = await cancelContentGenerationJob(id);
    await logAudit({ actor, action: "content_generation.cancelled", resourceType: "ContentGenerationJob", resourceId: id });
    return jsonOk({ job });
  } catch (error) {
    return apiError(error);
  }
}
