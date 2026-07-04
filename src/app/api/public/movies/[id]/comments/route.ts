import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createCommentSchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";
import { requireViewerFromRequest } from "@/lib/viewer-auth";
import { resolvePublicMovie } from "@/lib/public-movie";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const movie = await resolvePublicMovie(id);
    if (!movie) throw new ApiError("movie_not_found", 404);

    const { searchParams } = req.nextUrl;
    const take = Math.min(Number(searchParams.get("take") ?? 20), 50);
    const cursor = searchParams.get("cursor") ?? undefined;

    const comments = await prisma.comment.findMany({
      where: { movieId: movie.id },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: "desc" },
      include: { viewer: { select: { displayName: true } } },
    });

    return jsonOk({ comments, nextCursor: comments.at(-1)?.id ?? null });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const viewer = await requireViewerFromRequest(req);

    const { success } = await rateLimit(`viewer:comment:${viewer.id}`, { limit: 10, windowMs: 5 * 60 * 1000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const { id } = await params;
    const movie = await resolvePublicMovie(id);
    if (!movie) throw new ApiError("movie_not_found", 404);

    const input = createCommentSchema.parse(await req.json());
    const comment = await prisma.comment.create({
      data: { movieId: movie.id, viewerId: viewer.id, body: input.body },
      include: { viewer: { select: { displayName: true } } },
    });

    return jsonOk({ comment }, 201);
  } catch (err) {
    return apiError(err);
  }
}
