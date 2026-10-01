import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { getContentGenerationJob } from "@/lib/content-generation/job-service";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireMinRole("STAFF");
    const { id } = await params;
    const job = await getContentGenerationJob(id);
    if (!job) throw new ApiError("content_generation_job_not_found", 404);
    return jsonOk({ job });
  } catch (error) {
    return apiError(error);
  }
}
