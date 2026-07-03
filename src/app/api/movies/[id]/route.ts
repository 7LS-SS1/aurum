import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { updateMovieSchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { buildJwPlayerIframeUrl, getDefaultJwPlayerConfig } from "@/lib/jwplayer";

const LOCKED_FOR_STAFF: string[] = ["APPROVED", "PUBLISHING", "DONE", "PARTIAL", "FAILED", "ARCHIVED"];
const LOCKED_FOR_SENIOR: string[] = ["APPROVED", "PUBLISHING", "DONE", "PARTIAL", "FAILED", "ARCHIVED"];

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

    // Staff may only edit their own not-yet-approved draft; senior may edit
    // any movie up through the approval gate; manager+ can edit anytime.
    if (actor.role === "STAFF") {
      if (existing.createdById !== actor.id) throw new ApiError("forbidden", 403);
      if (LOCKED_FOR_STAFF.includes(existing.status)) throw new ApiError("movie_locked", 409);
    } else if (actor.role === "SENIOR") {
      if (LOCKED_FOR_SENIOR.includes(existing.status)) throw new ApiError("movie_locked", 409);
    }

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
