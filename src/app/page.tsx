import { PublicHeader } from "@/components/public/PublicHeader";
import { VideoCatalog } from "@/components/public/VideoCatalog";
import { getPublicCatalog } from "@/lib/public-catalog";

export const revalidate = 60;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string; page?: string }>;
}) {
  const { category, q, page: pageParam } = await searchParams;
  const query = q?.trim();
  const requestedPage = Math.max(1, Number(pageParam) || 1);
  const { movies, categories, pagination } = await getPublicCatalog(category, query, requestedPage);

  return (
    <>
      <PublicHeader q={query ?? ""} />
      <VideoCatalog movies={movies} categories={categories} category={category} query={query} basePath="/" pagination={pagination} />
    </>
  );
}
