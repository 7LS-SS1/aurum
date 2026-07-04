import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { distributeMovie } from "@/lib/distributor";
import { apiError, jsonOk } from "@/lib/api-response";
import { requireSystemKey } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.length > 0) : [];
}

async function publishApproved(req: NextRequest) {
  try {
    const actor = requireSystemKey(req);
    const take = Math.min(Math.max(Number(req.nextUrl.searchParams.get("take") ?? 5), 1), 25);

    const candidates = await prisma.movie.findMany({
      where: { status: "APPROVED" },
      orderBy: { updatedAt: "asc" },
      take: take * 3,
      select: { id: true, title: true, targetSiteIds: true },
    });

    const publishable = candidates
      .map((movie) => ({ ...movie, siteIds: asStringArray(movie.targetSiteIds) }))
      .filter((movie) => movie.siteIds.length > 0)
      .slice(0, take);

    const results = [];
    for (const movie of publishable) {
      try {
        const result = await distributeMovie(movie.id, movie.siteIds);
        await logAudit({
          actor,
          action: "cron_publish",
          resourceType: "movie",
          resourceId: movie.id,
          metadata: { total: result.summary.total, success: result.summary.success, finalStatus: result.status },
        });
        results.push({ movieId: movie.id, title: movie.title, status: "success", result });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown cron publish error";
        await logAudit({
          actor,
          action: "cron_publish_failed",
          resourceType: "movie",
          resourceId: movie.id,
          metadata: { error: message },
        });
        results.push({ movieId: movie.id, title: movie.title, status: "failed", error: message });
      }
    }

    return jsonOk({ scanned: candidates.length, queued: publishable.length, results });
  } catch (err) {
    return apiError(err);
  }
}

export async function GET(req: NextRequest) {
  return publishApproved(req);
}

export async function POST(req: NextRequest) {
  return publishApproved(req);
}
