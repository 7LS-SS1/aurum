import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateComicSeriesSchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("STAFF");
    const { id } = await params;
    const input = updateComicSeriesSchema.parse(await req.json());

    const existing = await prisma.comicSeries.findUnique({ where: { id } });
    if (!existing) throw new ApiError("comic_series_not_found", 404);

    const updated = await prisma.comicSeries.update({
      where: { id },
      data: { title: input.title, description: input.description, ...(input.slug ? { slug: input.slug } : {}) },
    });
    await logAudit({ actor, action: "update_comic_series", resourceType: "comic_series", resourceId: id });

    return jsonOk(updated);
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("STAFF");
    const { id } = await params;

    const existing = await prisma.comicSeries.findUnique({ where: { id } });
    if (!existing) throw new ApiError("comic_series_not_found", 404);

    await prisma.comicSeries.delete({ where: { id } });
    await logAudit({ actor, action: "delete_comic_series", resourceType: "comic_series", resourceId: id, metadata: { title: existing.title } });

    return jsonOk({ deleted: true, id });
  } catch (err) {
    return apiError(err);
  }
}
