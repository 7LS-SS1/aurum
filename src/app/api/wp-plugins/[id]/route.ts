import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { updateWordpressPluginSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { deleteR2Object, getR2ObjectKeyFromPublicUrl } from "@/lib/storage/r2";
import { verifyWordpressPluginPackage } from "@/lib/wordpress-plugin-package";

const includeCreator = { createdBy: { select: { id: true, name: true, email: true } } } as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("HEAD");
    const { id } = await params;
    const input = updateWordpressPluginSchema.parse(await req.json());
    const existing = await prisma.wordpressPlugin.findUnique({ where: { id } });
    if (!existing) throw new ApiError("plugin_not_found", 404);
    const next = { ...existing, ...input };
    if (next.slug !== existing.slug || next.version !== existing.version) {
      const duplicate = await prisma.wordpressPlugin.findUnique({ where: { slug_version: { slug: next.slug, version: next.version } } });
      if (duplicate && duplicate.id !== id) throw new ApiError("plugin_version_already_exists", 409);
    }
    let packageSize = next.packageSize;
    let checksumSha256 = next.checksumSha256;
    if (input.packageUrl || input.checksumSha256 || input.slug || input.version) {
      const verified = await verifyWordpressPluginPackage({
        ...next,
        checksumSha256: input.checksumSha256 ?? (input.packageUrl ? undefined : existing.checksumSha256),
      });
      packageSize = verified.size;
      checksumSha256 = verified.checksumSha256;
    }
    const plugin = await prisma.$transaction(async (tx) => {
      if (input.isActive === true) await tx.wordpressPlugin.updateMany({ where: { slug: next.slug, isActive: true, id: { not: id } }, data: { isActive: false } });
      return tx.wordpressPlugin.update({ where: { id }, data: { ...input, packageSize, checksumSha256 }, include: includeCreator });
    });
    await logAudit({ actor, action: "update_wordpress_plugin", resourceType: "wordpress_plugin", resourceId: id, metadata: { slug: plugin.slug, version: plugin.version, isActive: plugin.isActive } });
    return jsonOk(plugin);
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("HEAD");
    const { id } = await params;
    const existing = await prisma.wordpressPlugin.findUnique({ where: { id } });
    if (!existing) throw new ApiError("plugin_not_found", 404);
    const keys = [existing.packageUrl, existing.screenshotUrl, existing.iconUrl]
      .map((url) => (url ? getR2ObjectKeyFromPublicUrl(url) : null))
      .filter((key): key is string => Boolean(key));
    await Promise.all(keys.map(deleteR2Object));
    await prisma.wordpressPlugin.delete({ where: { id } });
    await logAudit({ actor, action: "delete_wordpress_plugin", resourceType: "wordpress_plugin", resourceId: id, metadata: { slug: existing.slug, version: existing.version, deletedKeys: keys } });
    return jsonOk({ deleted: true, id });
  } catch (err) {
    return apiError(err);
  }
}
