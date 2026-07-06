import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMinRole } from "@/lib/authz";
import { apiError, jsonOk } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    await requireMinRole("SENIOR");

    const { searchParams } = req.nextUrl;
    const take = Math.min(Number(searchParams.get("take") ?? 50), 100);
    const cursor = searchParams.get("cursor") ?? undefined;
    const movieId = searchParams.get("movieId") ?? undefined;

    const comments = await prisma.comment.findMany({
      where: { ...(movieId ? { movieId } : {}) },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: "desc" },
      include: {
        viewer: { select: { displayName: true, email: true } },
        movie: { select: { title: true } },
      },
    });

    return jsonOk({ comments, nextCursor: comments.at(-1)?.id ?? null });
  } catch (err) {
    return apiError(err);
  }
}
