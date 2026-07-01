import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createMovieSchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireRole } from "@/lib/authz";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  try {
    await requireRole("ADMIN", "EDITOR");

    const { searchParams } = req.nextUrl;
    const take = Math.min(Number(searchParams.get("take") ?? 20), 100);
    const cursor = searchParams.get("cursor") ?? undefined;

    const movies = await prisma.movie.findMany({
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: "desc" },
    });

    return jsonOk({ movies, nextCursor: movies.at(-1)?.id ?? null });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole("ADMIN", "EDITOR");

    const { success } = await rateLimit(`movies:create:${user.id}`, { limit: 30, windowMs: 60_000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const input = createMovieSchema.parse(await req.json());

    const movie = await prisma.movie.create({
      data: {
        title: input.title,
        slug: input.slug,
        excerpt: input.excerpt,
        content: input.content,
        mainCategory: input.mainCategory,
        categories: input.categories,
        tags: input.tags,
        thumbnailUrl: input.thumbnailUrl,
        videoUrl: input.videoUrl,
        videoProvider: input.videoProvider,
        extraMeta: input.extraMeta as Prisma.InputJsonValue,
      },
    });

    return jsonOk(movie, 201);
  } catch (err) {
    return apiError(err);
  }
}
