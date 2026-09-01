import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateComicCategorySchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("STAFF");
    const { id } = await params;
    const input = updateComicCategorySchema.parse(await req.json());

    const existing = await prisma.comicCategory.findUnique({ where: { id } });
    if (!existing) throw new ApiError("comic_category_not_found", 404);

    const updated = await prisma.comicCategory.update({ where: { id }, data: { name: input.name } });
    await logAudit({ actor, action: "update_comic_category", resourceType: "comic_category", resourceId: id, metadata: { from: existing.name, to: updated.name } });

    return jsonOk(updated);
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("STAFF");
    const { id } = await params;

    const existing = await prisma.comicCategory.findUnique({ where: { id } });
    if (!existing) throw new ApiError("comic_category_not_found", 404);

    await prisma.comicCategory.delete({ where: { id } });
    await logAudit({ actor, action: "delete_comic_category", resourceType: "comic_category", resourceId: id, metadata: { name: existing.name } });

    return jsonOk({ deleted: true, id });
  } catch (err) {
    return apiError(err);
  }
}
