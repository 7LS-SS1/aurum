import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { createWordpressPluginSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { verifyWordpressPluginPackage } from "@/lib/wordpress-plugin-package";

const includeCreator = { createdBy: { select: { id: true, name: true, email: true } } } as const;

export async function GET() {
  try {
    await requireMinRole("STAFF");
    const plugins = await prisma.wordpressPlugin.findMany({ orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }], include: includeCreator });
    return jsonOk({ plugins });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireMinRole("HEAD");
    const input = createWordpressPluginSchema.parse(await req.json());
    if (await prisma.wordpressPlugin.findUnique({ where: { slug_version: { slug: input.slug, version: input.version } } })) {
      throw new ApiError("plugin_version_already_exists", 409);
    }
    const verified = await verifyWordpressPluginPackage(input);
    const plugin = await prisma.$transaction(async (tx) => {
      if (input.isActive) await tx.wordpressPlugin.updateMany({ where: { slug: input.slug, isActive: true }, data: { isActive: false } });
      return tx.wordpressPlugin.create({ data: { ...input, packageSize: verified.size, checksumSha256: verified.checksumSha256, createdById: actor.id }, include: includeCreator });
    });
    await logAudit({ actor, action: "create_wordpress_plugin", resourceType: "wordpress_plugin", resourceId: plugin.id, metadata: { slug: plugin.slug, version: plugin.version, checksumSha256: plugin.checksumSha256 } });
    return jsonOk(plugin, 201);
  } catch (err) {
    return apiError(err);
  }
}
