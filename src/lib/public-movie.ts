import { prisma } from "@/lib/prisma";
import { cachePublic } from "@/lib/cache";

/** Shared "is this movie publicly visible, looked up by slug-or-id" lookup — used by the public watch page and every /api/public/movies/[id]/* route. */
export function resolvePublicMovie(idOrSlug: string) {
  return cachePublic("movie", [idOrSlug], 30, () =>
    prisma.movie.findFirst({
      where: {
        status: { in: ["DONE", "PARTIAL"] },
        OR: [{ slug: idOrSlug }, { id: idOrSlug }],
      },
    }),
  );
}
