import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { distributeSchema } from "@/lib/validation";
import { distributeMovie } from "@/lib/distributor";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireRoleOrSystem } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { canDistributeMovie } from "@/lib/distribution-policy";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoleOrSystem(req, "MANAGER", "HEAD", "SYSTEM");

    // Distribution fans out to third-party sites — worth a tighter limit than
    // plain CRUD so a stuck client retry-loop can't hammer every WP target.
    const { success } = await rateLimit(`distribute:${actor.id ?? "system"}`, { limit: 10, windowMs: 60_000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const { id } = await params;
    const { siteIds, mode } = distributeSchema.parse(await req.json());

    const movie = await prisma.movie.findUnique({ where: { id } });
    if (!movie) throw new ApiError("movie_not_found", 404);
    if (!canDistributeMovie(movie.status, actor.role)) {
      throw new ApiError(`cannot_publish_from_${movie.status.toLowerCase()}`, 409);
    }

    const result = await distributeMovie(id, siteIds, mode);

    await logAudit({
      actor,
      action: "publish",
      resourceType: "movie",
      resourceId: id,
      metadata: { total: result.summary.total, success: result.summary.success, finalStatus: result.status, mode },
    });
    if (result.status !== "done") {
      await logAudit({
        actor,
        action: "distribution_failed",
        resourceType: "movie",
        resourceId: id,
        metadata: { failedSites: result.results.filter((r) => r.status === "failed").map((r) => r.siteId) },
      });
    }

    return jsonOk(result);
  } catch (err) {
    return apiError(err);
  }
}
