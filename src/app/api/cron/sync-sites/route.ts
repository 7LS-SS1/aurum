import { NextRequest } from "next/server";
import { apiError, jsonOk } from "@/lib/api-response";
import { requireSystemKey } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { processPendingDistributions } from "@/lib/site-backfill";

/**
 * Separate from /api/cron/publish-approved on purpose: that cron drives a
 * Movie through its own status lifecycle (APPROVED -> PUBLISHING -> DONE/
 * PARTIAL/FAILED) across *all* of its target sites at once. This one just
 * works through the Distribution table's PENDING backlog row by row (mostly
 * populated by /api/sites/[id]/sync-existing) without ever touching
 * Movie.status — keeping the two flows separate avoids entangling "first
 * publish" semantics with "backfill an extra site" semantics.
 */
async function syncSites(req: NextRequest) {
  try {
    const actor = requireSystemKey(req);
    const take = Math.min(Math.max(Number(req.nextUrl.searchParams.get("take") ?? 30), 1), 50);

    const result = await processPendingDistributions(take);

    await logAudit({
      actor,
      action: "cron_sync_sites",
      resourceType: "distribution",
      metadata: { ...result },
    });

    return jsonOk(result);
  } catch (err) {
    return apiError(err);
  }
}

export async function GET(req: NextRequest) {
  return syncSites(req);
}

export async function POST(req: NextRequest) {
  return syncSites(req);
}
