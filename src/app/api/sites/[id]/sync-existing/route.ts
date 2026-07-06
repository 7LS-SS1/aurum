import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { createBackfillJobs } from "@/lib/site-backfill";

/**
 * Queues every eligible (already approved/published) movie that isn't yet
 * associated with this site for backfill — the actual WordPress posting
 * happens later, picked up in batches by /api/cron/sync-sites. Idempotent:
 * re-running against the same site only ever creates rows for movies that
 * still don't have one (see createBackfillJobs).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("MANAGER");
    const { id } = await params;

    const { success } = await rateLimit(`sites:sync:${actor.id}`, { limit: 5, windowMs: 60_000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const site = await prisma.targetSite.findUnique({ where: { id } });
    if (!site) throw new ApiError("site_not_found", 404);
    if (!site.isActive) throw new ApiError("site_inactive", 409);

    const result = await createBackfillJobs(id);

    await logAudit({
      actor,
      action: "sync_existing_movies",
      resourceType: "site",
      resourceId: id,
      metadata: { ...result },
    });

    return jsonOk(result);
  } catch (err) {
    return apiError(err);
  }
}
