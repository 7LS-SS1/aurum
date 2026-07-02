import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

const SUBMITTABLE_FROM = ["DRAFT", "REJECTED"];

/** Staff moves their own draft into the review queue: DRAFT|REJECTED -> READY_FOR_REVIEW. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("STAFF");
    const { id } = await params;

    const movie = await prisma.movie.findUnique({ where: { id } });
    if (!movie) throw new ApiError("movie_not_found", 404);
    if (actor.role === "STAFF" && movie.createdById !== actor.id) throw new ApiError("forbidden", 403);
    if (!SUBMITTABLE_FROM.includes(movie.status)) {
      throw new ApiError(`cannot_submit_from_${movie.status.toLowerCase()}`, 409);
    }

    const updated = await prisma.movie.update({
      where: { id },
      data: { status: "READY_FOR_REVIEW", rejectionReason: null, reviewerId: null },
    });

    await logAudit({ actor, action: "submit_review", resourceType: "movie", resourceId: id });

    return jsonOk(updated);
  } catch (err) {
    return apiError(err);
  }
}
