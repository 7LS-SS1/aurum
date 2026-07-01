import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { updateMovieSchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireRole } from "@/lib/authz";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("ADMIN", "EDITOR");
    const { id } = await params;
    const movie = await prisma.movie.findUnique({ where: { id } });
    if (!movie) throw new ApiError("movie_not_found", 404);
    return jsonOk(movie);
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("ADMIN", "EDITOR");
    const { id } = await params;
    const input = updateMovieSchema.parse(await req.json());

    const existing = await prisma.movie.findUnique({ where: { id } });
    if (!existing) throw new ApiError("movie_not_found", 404);

    const movie = await prisma.movie.update({
      where: { id },
      data: { ...input, extraMeta: input.extraMeta as Prisma.InputJsonValue | undefined },
    });
    return jsonOk(movie);
  } catch (err) {
    return apiError(err);
  }
}
