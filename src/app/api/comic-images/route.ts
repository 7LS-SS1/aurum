import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createComicImagesSchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

/** The "complete" step — records ComicChapterImage rows for files the client already PUT to R2 via /api/comic-uploads/presign-batch. */
export async function POST(req: NextRequest) {
  try {
    const actor = await requireMinRole("STAFF");
    const input = createComicImagesSchema.parse(await req.json());

    const chapter = await prisma.comicChapter.findUnique({ where: { id: input.chapterId }, select: { id: true } });
    if (!chapter) throw new ApiError("comic_chapter_not_found", 404);

    const images = await prisma.comicChapterImage.createManyAndReturn({
      data: input.items.map((item) => ({
        chapterId: input.chapterId,
        imageUrl: item.publicUrl,
        objectKey: item.objectKey,
        sortOrder: item.sortOrder,
        width: item.width,
        height: item.height,
      })),
    });

    await logAudit({ actor, action: "create_comic_images", resourceType: "comic_chapter", resourceId: input.chapterId, metadata: { count: images.length } });

    return jsonOk(images, 201);
  } catch (err) {
    return apiError(err);
  }
}
