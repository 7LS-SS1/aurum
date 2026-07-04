import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";
import { requireViewerFromRequest } from "@/lib/viewer-auth";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ commentId: string }> }) {
  try {
    const viewer = await requireViewerFromRequest(req);

    const { success } = await rateLimit(`viewer:comment:delete:${viewer.id}`, { limit: 20, windowMs: 5 * 60 * 1000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const { commentId } = await params;
    const comment = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw new ApiError("comment_not_found", 404);
    if (comment.viewerId !== viewer.id) throw new ApiError("forbidden", 403);

    await prisma.comment.delete({ where: { id: commentId } });
    return jsonOk({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
