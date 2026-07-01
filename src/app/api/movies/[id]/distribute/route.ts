import { NextRequest } from "next/server";
import { distributeSchema } from "@/lib/validation";
import { distributeMovie } from "@/lib/distributor";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireRole } from "@/lib/authz";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("ADMIN", "EDITOR");

    // Distribution fans out to third-party sites — worth a tighter limit than
    // plain CRUD so a stuck client retry-loop can't hammer every WP target.
    const { success } = await rateLimit(`distribute:${user.id}`, { limit: 10, windowMs: 60_000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const { id } = await params;
    const { siteIds } = distributeSchema.parse(await req.json());

    const result = await distributeMovie(id, siteIds);
    return jsonOk(result);
  } catch (err) {
    return apiError(err);
  }
}
