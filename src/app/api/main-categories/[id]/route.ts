import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateMainCategorySchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

/**
 * Movie.mainCategory stores the chosen name directly (Json-free string, not
 * a foreign key — see the doc-comment on the MainCategory model in
 * schema.prisma), so renaming/deleting here intentionally never touches
 * already-published movies, same rationale as Category.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("STAFF");
    const { id } = await params;
    const input = updateMainCategorySchema.parse(await req.json());

    const existing = await prisma.mainCategory.findUnique({ where: { id } });
    if (!existing) throw new ApiError("main_category_not_found", 404);

    const updated = await prisma.mainCategory.update({ where: { id }, data: { name: input.name } });
    await logAudit({ actor, action: "update_main_category", resourceType: "main_category", resourceId: id, metadata: { from: existing.name, to: updated.name } });

    return jsonOk(updated);
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("STAFF");
    const { id } = await params;

    const existing = await prisma.mainCategory.findUnique({ where: { id } });
    if (!existing) throw new ApiError("main_category_not_found", 404);

    await prisma.mainCategory.delete({ where: { id } });
    await logAudit({ actor, action: "delete_main_category", resourceType: "main_category", resourceId: id, metadata: { name: existing.name } });

    return jsonOk({ deleted: true, id });
  } catch (err) {
    return apiError(err);
  }
}
