import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

/** Manager/head sign-off: READY_FOR_APPROVAL -> APPROVED. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("MANAGER");
    const { id } = await params;

    const movie = await prisma.movie.findUnique({ where: { id } });
    if (!movie) throw new ApiError("movie_not_found", 404);
    if (movie.status !== "READY_FOR_APPROVAL") throw new ApiError(`cannot_approve_from_${movie.status.toLowerCase()}`, 409);

    const updated = await prisma.movie.update({ where: { id }, data: { status: "APPROVED" } });

    await logAudit({ actor, action: "approve", resourceType: "movie", resourceId: id });

    return jsonOk(updated);
  } catch (err) {
    return apiError(err);
  }
}
