import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";
import { requireViewerFromRequest } from "@/lib/viewer-auth";
import { resolvePublicMovie } from "@/lib/public-movie";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const viewer = await requireViewerFromRequest(req);
    const { id } = await params;
    const movie = await resolvePublicMovie(id);
    if (!movie) throw new ApiError("movie_not_found", 404);

    const saved = await prisma.watchLater.findUnique({
      where: { movieId_viewerId: { movieId: movie.id, viewerId: viewer.id } },
    });
    return jsonOk({ saved: Boolean(saved) });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const viewer = await requireViewerFromRequest(req);

    const { success } = await rateLimit(`viewer:watchlater:${viewer.id}`, { limit: 60, windowMs: 60_000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const { id } = await params;
    const movie = await resolvePublicMovie(id);
    if (!movie) throw new ApiError("movie_not_found", 404);

    const existing = await prisma.watchLater.findUnique({
      where: { movieId_viewerId: { movieId: movie.id, viewerId: viewer.id } },
    });

    if (existing) {
      await prisma.watchLater.delete({ where: { id: existing.id } });
      return jsonOk({ saved: false });
    }
    await prisma.watchLater.create({ data: { movieId: movie.id, viewerId: viewer.id } });
    return jsonOk({ saved: true });
  } catch (err) {
    return apiError(err);
  }
}
