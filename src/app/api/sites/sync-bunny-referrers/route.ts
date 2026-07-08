import { prisma } from "@/lib/prisma";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { syncBunnyReferrers } from "@/lib/bunny-referrers";

/**
 * Adds every active TargetSite's hostname (+ AURUM's own domain) to the
 * Bunny Stream video library's Allowed Referrers, so distributed videos
 * aren't hotlink-blocked (403) on WordPress sites that were only ever
 * registered in AURUM, never added manually in the Bunny dashboard.
 */
export async function POST() {
  try {
    const actor = await requireMinRole("MANAGER");

    const { success } = await rateLimit(`sites:sync-bunny-referrers:${actor.id}`, { limit: 5, windowMs: 60_000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const sites = await prisma.targetSite.findMany({ where: { isActive: true }, select: { baseUrl: true } });
    const result = await syncBunnyReferrers(sites.map((s) => s.baseUrl));

    await logAudit({
      actor,
      action: "sync_bunny_referrers",
      resourceType: "site",
      metadata: { ...result },
    });

    return jsonOk(result);
  } catch (err) {
    return apiError(err);
  }
}
