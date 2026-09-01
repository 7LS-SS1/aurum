import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateComicChapterSchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { cleanupComicObjectKeys } from "@/lib/storage/comic-cleanup";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireMinRole("STAFF");
    const { id } = await params;
    const chapter = await prisma.comicChapter.findUnique({
      where: { id },
      include: { comic: { select: { id: true, title: true, slug: true } }, images: { orderBy: { sortOrder: "asc" } } },
    });
    if (!chapter) throw new ApiError("comic_chapter_not_found", 404);
    return jsonOk(chapter);
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("STAFF");
    const { id } = await params;
    const input = updateComicChapterSchema.parse(await req.json());

    const existing = await prisma.comicChapter.findUnique({ where: { id } });
    if (!existing) throw new ApiError("comic_chapter_not_found", 404);

    const chapter = await prisma.comicChapter.update({ where: { id }, data: input });
    await logAudit({ actor, action: "update_comic_chapter", resourceType: "comic_chapter", resourceId: id });

    return jsonOk(chapter);
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("STAFF");
    const { id } = await params;

    const existing = await prisma.comicChapter.findUnique({
      where: { id },
      select: { id: true, number: true, comicId: true, images: { select: { objectKey: true } } },
    });
    if (!existing) throw new ApiError("comic_chapter_not_found", 404);

    await cleanupComicObjectKeys(existing.images.map((img) => img.objectKey));

    await prisma.comicChapter.delete({ where: { id } });
    await logAudit({ actor, action: "delete_comic_chapter", resourceType: "comic_chapter", resourceId: id, metadata: { comicId: existing.comicId, number: existing.number } });

    return jsonOk({ deleted: true, id });
  } catch (err) {
    return apiError(err);
  }
}
