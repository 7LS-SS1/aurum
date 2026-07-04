import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PublicHeader } from "@/components/public/PublicHeader";
import { VideoCatalog } from "@/components/public/VideoCatalog";

export const revalidate = 60;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const { category, q } = await searchParams;
  const query = q?.trim();
  const baseWhere: Prisma.MovieWhereInput = { status: { in: ["DONE", "PARTIAL"] } };

  const [movies, categories] = await Promise.all([
    prisma.movie.findMany({
      where: {
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
      },
      orderBy: { createdAt: "desc" },
      take: 60,
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
    }),
    prisma.movie.findMany({
      where: baseWhere,
      distinct: ["mainCategory"],
      select: { mainCategory: true },
    }),
  ]);
  const categoryNames = categories.map((c) => c.mainCategory).filter((c): c is string => Boolean(c));

  return (
    <>
      <PublicHeader q={query ?? ""} />
      <VideoCatalog movies={movies} categories={categoryNames} category={category} query={query} basePath="/" />
    </>
  );
}
