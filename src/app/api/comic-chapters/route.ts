import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createComicChapterSchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const actor = await requireMinRole("STAFF");

    const { success } = await rateLimit(`comic-chapters:create:${actor.id}`, { limit: 30, windowMs: 60_000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const input = createComicChapterSchema.parse(await req.json());

    const comic = await prisma.comic.findUnique({ where: { id: input.comicId }, select: { id: true } });
    if (!comic) throw new ApiError("comic_not_found", 404);

    const chapter = await prisma.comicChapter.create({
      data: {
        comicId: input.comicId,
        number: input.number,
        title: input.title,
        publishedAt: input.publishedAt ?? new Date(),
      },
    });

    await logAudit({ actor, action: "create_comic_chapter", resourceType: "comic_chapter", resourceId: chapter.id, metadata: { comicId: input.comicId, number: chapter.number } });

    return jsonOk(chapter, 201);
  } catch (err) {
    return apiError(err);
  }
}
