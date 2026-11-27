import { prisma } from "@/lib/prisma";
import { ApiError, apiError, jsonOk } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";

/** POST = retry a failed job, DELETE = remove a job that has not produced a video. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireMinRole("STAFF");
    const { id } = await params;
    const { count } = await prisma.autoDownloadJob.updateMany({ where: { id, status: "FAILED" }, data: { status: "QUEUED", attempts: 0, error: null, finishedAt: null } });
    if (!count) throw new ApiError("job_not_retryable", 409);
    return jsonOk({ id, status: "QUEUED" });
  } catch (error) { return apiError(error); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireMinRole("STAFF");
    const { id } = await params;
    const { count } = await prisma.autoDownloadJob.deleteMany({ where: { id, status: { in: ["QUEUED", "FAILED"] } } });
    if (!count) throw new ApiError("job_not_removable", 409);
    return jsonOk({ id, deleted: true });
  } catch (error) { return apiError(error); }
}
