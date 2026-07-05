import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { updateWordpressThemeSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { deleteR2Object, getR2ObjectKeyFromPublicUrl } from "@/lib/storage/r2";

async function deleteKnownR2Url(url: string | null) {
  if (!url) return null;
  const key = getR2ObjectKeyFromPublicUrl(url);
  if (!key) return null;
  await deleteR2Object(key);
  return key;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("HEAD");
    const { id } = await params;
    const input = updateWordpressThemeSchema.parse(await req.json());

    const existing = await prisma.wordpressTheme.findUnique({ where: { id } });
    if (!existing) throw new ApiError("theme_not_found", 404);

    const slug = input.slug ?? existing.slug;
    const version = input.version ?? existing.version;
    if ((input.slug || input.version) && (slug !== existing.slug || version !== existing.version)) {
      const duplicate = await prisma.wordpressTheme.findUnique({ where: { slug_version: { slug, version } } });
      if (duplicate && duplicate.id !== id) throw new ApiError("theme_version_already_exists", 409);
    }

    const theme = await prisma.$transaction(async (tx) => {
      if (input.isActive === true) {
        await tx.wordpressTheme.updateMany({ where: { slug, isActive: true, id: { not: id } }, data: { isActive: false } });
      }

      return tx.wordpressTheme.update({ where: { id }, data: input });
    });

    await logAudit({
      actor,
      action: "update_wordpress_theme",
      resourceType: "wordpress_theme",
      resourceId: theme.id,
      metadata: { slug: theme.slug, version: theme.version, isActive: theme.isActive },
    });

    return jsonOk(theme);
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("HEAD");
    const { id } = await params;
    const existing = await prisma.wordpressTheme.findUnique({ where: { id } });
    if (!existing) throw new ApiError("theme_not_found", 404);

    const deletedKeys = [await deleteKnownR2Url(existing.packageUrl), await deleteKnownR2Url(existing.screenshotUrl)].filter(
      (key): key is string => Boolean(key),
    );

    await prisma.$transaction([
      prisma.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: "delete_wordpress_theme",
          resourceType: "wordpress_theme",
          resourceId: id,
          metadata: { slug: existing.slug, version: existing.version, deletedKeys },
        },
      }),
      prisma.wordpressTheme.delete({ where: { id } }),
    ]);

    return jsonOk({ deleted: true, id, deletedKeys });
  } catch (err) {
    return apiError(err);
  }
}
