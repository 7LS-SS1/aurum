import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { resolvePublicMovie } from "@/lib/public-movie";

/** Best-effort view-count beacon, fired once per watch-page mount from the client (the page itself is `revalidate = 60`, so a server-side increment there would be stale). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const movie = await resolvePublicMovie(id);
    if (!movie) throw new ApiError("movie_not_found", 404);

    const { success } = await rateLimit(`public:view:${clientIp(req)}:${movie.id}`, { limit: 1, windowMs: 60_000 });
    if (!success) return jsonOk({ ok: true }, 202); // silently drop repeat pings, not an error for the caller

    await prisma.movie.update({ where: { id: movie.id }, data: { viewCount: { increment: 1 } } });
    return jsonOk({ ok: true }, 202);
  } catch (err) {
    return apiError(err);
  }
}
