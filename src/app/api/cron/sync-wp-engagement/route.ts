import { NextRequest } from "next/server";
import { apiError, jsonOk } from "@/lib/api-response";
import { requireSystemKey } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { syncWordPressEngagement } from "@/lib/wp-engagement-sync";

async function sync(req: NextRequest) {
  try {
    const actor = requireSystemKey(req);
    const take = Number(req.nextUrl.searchParams.get("take") ?? 50);
    const result = await syncWordPressEngagement({ take });

    await logAudit({
      actor,
      action: "cron_sync_wp_engagement",
      resourceType: "wordpress_engagement",
      metadata: { scanned: result.scanned, success: result.success, failed: result.failed, moviesUpdated: result.moviesUpdated },
    });

    return jsonOk(result);
  } catch (err) {
    return apiError(err);
  }
}

export async function GET(req: NextRequest) {
  return sync(req);
}

export async function POST(req: NextRequest) {
  return sync(req);
}
