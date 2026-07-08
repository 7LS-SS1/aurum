import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PublicHeader } from "@/components/public/PublicHeader";
import { VideoCatalog } from "@/components/public/VideoCatalog";

export const revalidate = 60;
const PAGE_SIZE = 20;

export default async function VideosPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string; page?: string }>;
}) {
  const { category, q, page: pageParam } = await searchParams;
  const query = q?.trim();
  const baseWhere: Prisma.MovieWhereInput = { status: { in: ["DONE", "PARTIAL"] } };
  const requestedPage = Math.max(1, Number(pageParam) || 1);
  const where: Prisma.MovieWhereInput = {
    ...baseWhere,
    ...(category ? { mainCategory: category } : {}),
    ...(query
      ? {
          OR: [
            { title: { contains: query } },
            { mainCategory: { contains: query } },
            { excerpt: { contains: query } },
          ],
        }
      : {}),
  };

  const [total, categories] = await Promise.all([
    prisma.movie.count({ where }),
    prisma.movie.findMany({
      where: baseWhere,
      distinct: ["mainCategory"],
      select: { mainCategory: true },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const movies = await prisma.movie.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      slug: true,
      title: true,
      mainCategory: true,
      thumbnailUrl: true,
      previewUrl: true,
      extraMeta: true,
      createdAt: true,
    },
  });

  const categoryNames = categories.map((c) => c.mainCategory).filter((c): c is string => Boolean(c));

  return (
    <>
      <PublicHeader q={query ?? ""} searchAction="/videos" />
      <VideoCatalog
        movies={movies}
        categories={categoryNames}
        category={category}
        query={query}
        basePath="/videos"
        pagination={{ page, totalPages, total }}
      />
    </>
  );
}
