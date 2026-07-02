import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

const ARCHIVABLE_FROM = ["APPROVED", "DONE", "PARTIAL", "FAILED", "REJECTED"];

/** Manager/head retires a movie from the active list: * -> ARCHIVED. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("MANAGER");
    const { id } = await params;

    const movie = await prisma.movie.findUnique({ where: { id } });
    if (!movie) throw new ApiError("movie_not_found", 404);
    if (!ARCHIVABLE_FROM.includes(movie.status)) throw new ApiError(`cannot_archive_from_${movie.status.toLowerCase()}`, 409);

    const updated = await prisma.movie.update({ where: { id }, data: { status: "ARCHIVED" } });

    await logAudit({ actor, action: "archive", resourceType: "movie", resourceId: id });

    return jsonOk(updated);
  } catch (err) {
    return apiError(err);
  }
}
