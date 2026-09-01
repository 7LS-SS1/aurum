import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateComicSchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { cleanupComicObjectKeys } from "@/lib/storage/comic-cleanup";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireMinRole("STAFF");
    const { id } = await params;
    const comic = await prisma.comic.findUnique({
      where: { id },
      include: {
        series: { select: { id: true, title: true } },
        categories: { select: { id: true, name: true } },
        tags: { select: { id: true, name: true } },
        chapters: { orderBy: { publishedAt: "desc" }, select: { id: true, number: true, title: true, publishedAt: true, _count: { select: { images: true } } } },
      },
    });
    if (!comic) throw new ApiError("comic_not_found", 404);
    return jsonOk(comic);
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("STAFF");
    const { id } = await params;
    const input = updateComicSchema.parse(await req.json());

    const existing = await prisma.comic.findUnique({ where: { id } });
    if (!existing) throw new ApiError("comic_not_found", 404);

    const { categoryIds, tags, ...rest } = input;

    const comic = await prisma.comic.update({
      where: { id },
      data: {
        ...rest,
        seriesId: input.seriesId === null ? null : (input.seriesId ?? undefined),
        ...(categoryIds !== undefined ? { categories: { set: categoryIds.map((catId) => ({ id: catId })) } } : {}),
        ...(tags !== undefined ? { tags: { set: [], connectOrCreate: tags.map((name) => ({ where: { name }, create: { name } })) } } : {}),
      },
    });

    await logAudit({ actor, action: "update_comic", resourceType: "comic", resourceId: id });

    return jsonOk(comic);
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("STAFF");
    const { id } = await params;

    const existing = await prisma.comic.findUnique({
      where: { id },
      select: { id: true, title: true, coverObjectKey: true, chapters: { select: { images: { select: { objectKey: true } } } } },
    });
    if (!existing) throw new ApiError("comic_not_found", 404);

    const objectKeys = [existing.coverObjectKey, ...existing.chapters.flatMap((ch) => ch.images.map((img) => img.objectKey))];
    await cleanupComicObjectKeys(objectKeys);

    await prisma.comic.delete({ where: { id } });
    await logAudit({ actor, action: "delete_comic", resourceType: "comic", resourceId: id, metadata: { title: existing.title } });

    return jsonOk({ deleted: true, id });
  } catch (err) {
    return apiError(err);
  }
}
