import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { updateMovieSchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { buildJwPlayerIframeUrl, getDefaultJwPlayerConfig } from "@/lib/jwplayer";
import { cleanupMovieMedia } from "@/lib/storage/media-cleanup";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireMinRole("STAFF");
    const { id } = await params;
    const movie = await prisma.movie.findUnique({
      where: { id },
      include: { createdBy: { select: { id: true, name: true, email: true } }, reviewer: { select: { id: true, name: true, email: true } } },
    });
    if (!movie) throw new ApiError("movie_not_found", 404);
    return jsonOk(movie);
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("STAFF");
    const { id } = await params;
    const input = updateMovieSchema.parse(await req.json());

    const existing = await prisma.movie.findUnique({ where: { id } });
    if (!existing) throw new ApiError("movie_not_found", 404);

    const defaultPlayer = input.videoProvider === "jwplayer" ? await getDefaultJwPlayerConfig() : undefined;
    const iframeUrl =
      input.iframeUrl ?? (input.videoProvider === "jwplayer" ? buildJwPlayerIframeUrl(input.jwPlayerMediaId ?? existing.jwPlayerMediaId, defaultPlayer) : undefined);

    const movie = await prisma.movie.update({
      where: { id },
      data: {
        ...input,
        ...(iframeUrl !== undefined ? { iframeUrl } : {}),
        extraMeta: input.extraMeta as Prisma.InputJsonValue | undefined,
        targetSiteIds: input.targetSiteIds as Prisma.InputJsonValue | undefined,
      },
    });

    await logAudit({ actor, action: "update_movie", resourceType: "movie", resourceId: movie.id });

    return jsonOk(movie);
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("STAFF");
    const { id } = await params;

    const existing = await prisma.movie.findUnique({
      where: { id },
      select: { id: true, title: true, status: true, thumbnailUrl: true, previewUrl: true, videoUrl: true },
    });
    if (!existing) throw new ApiError("movie_not_found", 404);
    if (existing.status === "PUBLISHING") throw new ApiError("cannot_delete_while_publishing", 409);

    const mediaCleanup = await cleanupMovieMedia(existing);

    await prisma.$transaction([
      prisma.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: "delete_movie",
          resourceType: "movie",
          resourceId: id,
          metadata: { title: existing.title, status: existing.status, mediaCleanup } as unknown as Prisma.InputJsonValue,
        },
      }),
      prisma.movie.delete({ where: { id } }),
    ]);

    return jsonOk({ deleted: true, id, mediaCleanup });
  } catch (err) {
    return apiError(err);
  }
}
