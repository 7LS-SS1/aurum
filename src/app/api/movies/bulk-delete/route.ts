import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { cleanupMovieMedia } from "@/lib/storage/media-cleanup";

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
});

export async function POST(req: NextRequest) {
  try {
    const actor = await requireMinRole("STAFF");
    const { ids } = bulkDeleteSchema.parse(await req.json());
    const uniqueIds = [...new Set(ids)];

    const movies = await prisma.movie.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, title: true, status: true, thumbnailUrl: true, previewUrl: true, videoUrl: true },
    });
    if (movies.length !== uniqueIds.length) throw new ApiError("some_movies_not_found", 404);

    const publishing = movies.filter((movie) => movie.status === "PUBLISHING");
    if (publishing.length) {
      throw new ApiError("cannot_delete_while_publishing", 409);
    }

    const mediaCleanup = await Promise.all(movies.map((movie) => cleanupMovieMedia(movie)));
    const cleanupByMovieId = new Map(mediaCleanup.map((result, index) => [movies[index]?.id, result]));

    await prisma.$transaction([
      prisma.auditLog.createMany({
        data: movies.map((movie) => ({
          actorId: actor.id,
          actorRole: actor.role,
          action: "delete_movie",
          resourceType: "movie",
          resourceId: movie.id,
          metadata: { title: movie.title, status: movie.status, mediaCleanup: cleanupByMovieId.get(movie.id) ?? null } as Prisma.InputJsonValue,
        })),
      }),
      prisma.movie.deleteMany({ where: { id: { in: uniqueIds } } }),
    ]);

    return jsonOk({ deleted: movies.length, ids: uniqueIds, mediaCleanup });
  } catch (err) {
    return apiError(err);
  }
}
