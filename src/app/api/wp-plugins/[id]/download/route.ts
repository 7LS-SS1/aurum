import { prisma } from "@/lib/prisma";
import { apiError, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("STAFF");
    const { id } = await params;
    const { success } = await rateLimit(`wp-plugin:download:${actor.id}`, { limit: 20, windowMs: 60_000 });
    if (!success) throw new ApiError("too_many_requests", 429);
    const plugin = await prisma.wordpressPlugin.findUnique({ where: { id } });
    if (!plugin) throw new ApiError("plugin_not_found", 404);
    const upstream = await fetch(plugin.packageUrl, { signal: AbortSignal.timeout(30_000) });
    if (!upstream.ok || !upstream.body) throw new ApiError("plugin_package_unavailable", 502);
    await logAudit({ actor, action: "download_wordpress_plugin", resourceType: "wordpress_plugin", resourceId: id, metadata: { slug: plugin.slug, version: plugin.version } });
    return new Response(upstream.body, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${plugin.slug}-${plugin.version}.zip"`, "X-Checksum-SHA256": plugin.checksumSha256 } });
  } catch (err) {
    return apiError(err);
  }
}
