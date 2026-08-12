import type { Prisma } from "@prisma/client";
import { cachePublic } from "@/lib/cache";
import { prisma } from "@/lib/prisma";

export const PUBLIC_CATALOG_PAGE_SIZE = 20;

const movieSelect = {
  id: true,
  slug: true,
  title: true,
  mainCategory: true,
  thumbnailUrl: true,
  previewUrl: true,
  extraMeta: true,
  createdAt: true,
} satisfies Prisma.MovieSelect;

async function queryCatalog(category: string | undefined, query: string | undefined, requestedPage: number) {
  const baseWhere: Prisma.MovieWhereInput = { status: { in: ["DONE", "PARTIAL"] } };
  const where: Prisma.MovieWhereInput = {
    ...baseWhere,
    ...(category ? { mainCategory: category } : {}),
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { mainCategory: { contains: query, mode: "insensitive" } },
            { excerpt: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, categories] = await Promise.all([
    prisma.movie.count({ where }),
    prisma.movie.findMany({ where: baseWhere, distinct: ["mainCategory"], select: { mainCategory: true } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PUBLIC_CATALOG_PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const movies = await prisma.movie.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PUBLIC_CATALOG_PAGE_SIZE,
    take: PUBLIC_CATALOG_PAGE_SIZE,
    select: movieSelect,
  });

  return {
    movies,
    categories: categories.map((item) => item.mainCategory).filter((name): name is string => Boolean(name)),
    pagination: { page, totalPages, total },
  };
}

export function getPublicCatalog(category: string | undefined, query: string | undefined, page: number) {
  // Arbitrary search terms have unbounded cardinality, so only stable catalog
  // and category pages enter Redis. Search still uses the same indexed query.
  if (query) return queryCatalog(category, query, page);
  return cachePublic("catalog", [category ?? "all", page], 60, () => queryCatalog(category, undefined, page));
}
