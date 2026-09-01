import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateCategorySchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

/**
 * Movie.categories stores the chosen names directly (Json array), not a
 * foreign key (see the doc-comment on the Category model in schema.prisma)
 * — renaming/deleting here intentionally never touches already-published
 * movies, same as the existing POST /api/categories behavior.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("STAFF");
    const { id } = await params;
    const input = updateCategorySchema.parse(await req.json());

    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) throw new ApiError("category_not_found", 404);

    const updated = await prisma.category.update({ where: { id }, data: { name: input.name } });
    await logAudit({ actor, action: "update_category", resourceType: "category", resourceId: id, metadata: { from: existing.name, to: updated.name } });

    return jsonOk(updated);
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("STAFF");
    const { id } = await params;

    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) throw new ApiError("category_not_found", 404);

    await prisma.category.delete({ where: { id } });
    await logAudit({ actor, action: "delete_category", resourceType: "category", resourceId: id, metadata: { name: existing.name } });

    return jsonOk({ deleted: true, id });
  } catch (err) {
    return apiError(err);
  }
}
