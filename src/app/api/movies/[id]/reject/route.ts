import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { rejectSchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

/** Senior bounces a movie back to staff with a reason: IN_REVIEW -> REJECTED. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("SENIOR");
    const { id } = await params;
    const { reason } = rejectSchema.parse(await req.json());

    const movie = await prisma.movie.findUnique({ where: { id } });
    if (!movie) throw new ApiError("movie_not_found", 404);
    if (movie.status !== "IN_REVIEW") throw new ApiError(`cannot_reject_from_${movie.status.toLowerCase()}`, 409);

    const updated = await prisma.movie.update({
      where: { id },
      data: { status: "REJECTED", rejectionReason: reason },
    });

    await logAudit({ actor, action: "reject", resourceType: "movie", resourceId: id, metadata: { reason } });

    return jsonOk(updated);
  } catch (err) {
    return apiError(err);
  }
}
