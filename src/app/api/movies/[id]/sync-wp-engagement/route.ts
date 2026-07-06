import { NextRequest } from "next/server";
import { apiError, jsonOk } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { syncWordPressEngagement } from "@/lib/wp-engagement-sync";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("MANAGER");
    const { id } = await params;
    const result = await syncWordPressEngagement({ movieId: id, take: 50 });

    await logAudit({
      actor,
      action: "sync_movie_wp_engagement",
      resourceType: "movie",
      resourceId: id,
      metadata: { scanned: result.scanned, success: result.success, failed: result.failed, moviesUpdated: result.moviesUpdated },
    });

    return jsonOk(result);
  } catch (err) {
    return apiError(err);
  }
}
