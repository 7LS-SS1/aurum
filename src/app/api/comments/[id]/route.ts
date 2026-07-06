import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("SENIOR");
    const { id } = await params;

    const comment = await prisma.comment.findUnique({ where: { id } });
    if (!comment) throw new ApiError("comment_not_found", 404);

    await prisma.comment.delete({ where: { id } });

    await logAudit({
      actor,
      action: "delete_comment",
      resourceType: "comment",
      resourceId: id,
      metadata: { movieId: comment.movieId, viewerId: comment.viewerId },
    });

    return jsonOk({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
