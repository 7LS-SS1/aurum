import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { distributeMovie } from "@/lib/distributor";

const PROCESSABLE_FROM = ["DRAFT", "REJECTED"];

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.length > 0) : [];
}

/**
 * Staff finishes uploading: DRAFT|REJECTED -> APPROVED -> published to every
 * target site immediately, in the same request. There's no separate
 * review/approval step or cron to wait on — a successful upload IS the
 * publish trigger. /api/cron/publish-approved still exists as a safety net
 * for any movie that somehow got stuck at APPROVED (e.g. a crash between the
 * status update and the distribute call below).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("STAFF");
    const { id } = await params;

    const movie = await prisma.movie.findUnique({ where: { id } });
    if (!movie) throw new ApiError("movie_not_found", 404);
    if (actor.role === "STAFF" && movie.createdById !== actor.id) throw new ApiError("forbidden", 403);
    if (!PROCESSABLE_FROM.includes(movie.status)) {
      throw new ApiError(`cannot_process_from_${movie.status.toLowerCase()}`, 409);
    }

    await prisma.movie.update({
      where: { id },
      data: { status: "APPROVED", rejectionReason: null, reviewerId: null },
    });
    await logAudit({ actor, action: "start_processing", resourceType: "movie", resourceId: id });

    const siteIds = asStringArray(movie.targetSiteIds);
    if (!siteIds.length) {
      // No active destination site yet — leave it at APPROVED so it can be
      // published later (manually, or once a site is added) instead of
      // silently failing here.
      return jsonOk(await prisma.movie.findUnique({ where: { id } }));
    }

    const result = await distributeMovie(id, siteIds);
    await logAudit({
      actor,
      action: "auto_publish",
      resourceType: "movie",
      resourceId: id,
      metadata: { total: result.summary.total, success: result.summary.success, finalStatus: result.status },
    });

    return jsonOk(await prisma.movie.findUnique({ where: { id } }));
  } catch (err) {
    return apiError(err);
  }
}
