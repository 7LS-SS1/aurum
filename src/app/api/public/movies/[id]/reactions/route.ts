import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { reactionSchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";
import { requireViewerFromRequest, getViewerFromRequest } from "@/lib/viewer-auth";
import { resolvePublicMovie } from "@/lib/public-movie";

async function aggregate(movieId: string, viewerId?: string) {
  const [likes, dislikes, mine] = await Promise.all([
    prisma.movieReaction.count({ where: { movieId, type: "LIKE" } }),
    prisma.movieReaction.count({ where: { movieId, type: "DISLIKE" } }),
    viewerId ? prisma.movieReaction.findUnique({ where: { movieId_viewerId: { movieId, viewerId } } }) : null,
  ]);
  return { likes, dislikes, viewerReaction: mine?.type ?? null };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const movie = await resolvePublicMovie(id);
    if (!movie) throw new ApiError("movie_not_found", 404);

    const viewer = await getViewerFromRequest(req);
    return jsonOk(await aggregate(movie.id, viewer?.id));
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const viewer = await requireViewerFromRequest(req);

    const { success } = await rateLimit(`viewer:reaction:${viewer.id}`, { limit: 60, windowMs: 60_000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const { id } = await params;
    const movie = await resolvePublicMovie(id);
    if (!movie) throw new ApiError("movie_not_found", 404);

    const input = reactionSchema.parse(await req.json());
    const existing = await prisma.movieReaction.findUnique({
      where: { movieId_viewerId: { movieId: movie.id, viewerId: viewer.id } },
    });

    if (existing?.type === input.type) {
      // Toggling the same reaction again removes it.
      await prisma.movieReaction.delete({ where: { id: existing.id } });
    } else {
      await prisma.movieReaction.upsert({
        where: { movieId_viewerId: { movieId: movie.id, viewerId: viewer.id } },
        create: { movieId: movie.id, viewerId: viewer.id, type: input.type },
        update: { type: input.type },
      });
    }

    return jsonOk(await aggregate(movie.id, viewer.id));
  } catch (err) {
    return apiError(err);
  }
}
