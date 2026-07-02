import { NextRequest } from "next/server";
import type { Prisma, MovieStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createMovieSchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

const MOVIE_STATUSES = [
  "DRAFT",
  "READY_FOR_REVIEW",
  "IN_REVIEW",
  "REJECTED",
  "READY_FOR_APPROVAL",
  "APPROVED",
  "PUBLISHING",
  "DONE",
  "PARTIAL",
  "FAILED",
  "ARCHIVED",
] as const;

export async function GET(req: NextRequest) {
  try {
    await requireMinRole("STAFF");

    const { searchParams } = req.nextUrl;
    const take = Math.min(Number(searchParams.get("take") ?? 20), 100);
    const cursor = searchParams.get("cursor") ?? undefined;

    const status = searchParams.get("status");
    const mainCategory = searchParams.get("mainCategory");
    const createdById = searchParams.get("createdById");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const q = searchParams.get("q")?.trim();

    const where: Prisma.MovieWhereInput = {
      ...(status && MOVIE_STATUSES.includes(status as MovieStatus) ? { status: status as MovieStatus } : {}),
      ...(mainCategory ? { mainCategory } : {}),
      ...(createdById ? { createdById } : {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
      ...(q
        ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }] }
        : {}),
    };

    const movies = await prisma.movie.findMany({
      where,
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: "desc" },
      include: { createdBy: { select: { id: true, name: true, email: true } } },
    });

    return jsonOk({ movies, nextCursor: movies.at(-1)?.id ?? null });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireMinRole("STAFF");

    const { success } = await rateLimit(`movies:create:${actor.id}`, { limit: 30, windowMs: 60_000 });
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
        jwPlayerMediaId: input.jwPlayerMediaId,
        extraMeta: input.extraMeta as Prisma.InputJsonValue,
        targetSiteIds: input.targetSiteIds as Prisma.InputJsonValue,
        createdById: actor.id,
      },
    });

    await logAudit({ actor, action: "create_movie", resourceType: "movie", resourceId: movie.id, metadata: { title: movie.title } });

    return jsonOk(movie, 201);
  } catch (err) {
    return apiError(err);
  }
}
