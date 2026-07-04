import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, jsonOk } from "@/lib/api-response";
import { requireViewerFromRequest } from "@/lib/viewer-auth";

export async function GET(req: NextRequest) {
  try {
    const viewer = await requireViewerFromRequest(req);
    const { searchParams } = req.nextUrl;
    const take = Math.min(Number(searchParams.get("take") ?? 20), 100);
    const cursor = searchParams.get("cursor") ?? undefined;

    const rows = await prisma.watchLater.findMany({
      where: { viewerId: viewer.id },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: "desc" },
      include: { movie: true },
    });

    return jsonOk({
      movies: rows.map((r) => r.movie),
      nextCursor: rows.at(-1)?.id ?? null,
    });
  } catch (err) {
    return apiError(err);
  }
}
