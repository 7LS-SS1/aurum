import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { reviewActionSchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

/**
 * Senior's two-step review claim:
 *  - action "start": READY_FOR_REVIEW -> IN_REVIEW, claims the review for this actor.
 *  - action "ready": IN_REVIEW -> READY_FOR_APPROVAL, only the claiming reviewer or a manager+ may complete it.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("SENIOR");
    const { id } = await params;
    const { action } = reviewActionSchema.parse(await req.json());

    const movie = await prisma.movie.findUnique({ where: { id } });
    if (!movie) throw new ApiError("movie_not_found", 404);

    if (action === "start") {
      if (movie.status !== "READY_FOR_REVIEW") throw new ApiError(`cannot_start_review_from_${movie.status.toLowerCase()}`, 409);
      const updated = await prisma.movie.update({
        where: { id },
        data: { status: "IN_REVIEW", reviewerId: actor.id },
      });
      await logAudit({ actor, action: "review_start", resourceType: "movie", resourceId: id });
      return jsonOk(updated);
    }

    // action === "ready"
    if (movie.status !== "IN_REVIEW") throw new ApiError(`cannot_mark_ready_from_${movie.status.toLowerCase()}`, 409);
    if (movie.reviewerId && movie.reviewerId !== actor.id && actor.role === "SENIOR") {
      throw new ApiError("review_claimed_by_another_reviewer", 403);
    }
    const updated = await prisma.movie.update({
      where: { id },
      data: { status: "READY_FOR_APPROVAL" },
    });
    await logAudit({ actor, action: "review_ready", resourceType: "movie", resourceId: id });
    return jsonOk(updated);
  } catch (err) {
    return apiError(err);
  }
}
