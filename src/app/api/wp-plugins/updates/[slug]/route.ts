import { prisma } from "@/lib/prisma";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const plugin = await prisma.wordpressPlugin.findFirst({ where: { slug, isActive: true }, orderBy: { updatedAt: "desc" } });
    if (!plugin) throw new ApiError("plugin_not_found", 404);
    return jsonOk({ name: plugin.name, slug: plugin.slug, version: plugin.version, download_url: plugin.packageUrl, requires: plugin.requiresWordpress, tested: plugin.testedWordpress, requires_php: plugin.requiresPhp, last_updated: plugin.updatedAt.toISOString(), checksum_sha256: plugin.checksumSha256, sections: { description: plugin.description ?? "", changelog: plugin.changelog ?? "" } });
  } catch (err) {
    return apiError(err);
  }
}
