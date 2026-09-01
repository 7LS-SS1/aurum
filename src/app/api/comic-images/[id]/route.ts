import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { cleanupComicObjectKeys } from "@/lib/storage/comic-cleanup";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("STAFF");
    const { id } = await params;

    const existing = await prisma.comicChapterImage.findUnique({ where: { id }, select: { id: true, chapterId: true, objectKey: true } });
    if (!existing) throw new ApiError("comic_image_not_found", 404);

    await cleanupComicObjectKeys([existing.objectKey]);

    await prisma.comicChapterImage.delete({ where: { id } });
    await logAudit({ actor, action: "delete_comic_image", resourceType: "comic_chapter_image", resourceId: id, metadata: { chapterId: existing.chapterId } });

    return jsonOk({ deleted: true, id });
  } catch (err) {
    return apiError(err);
  }
}
