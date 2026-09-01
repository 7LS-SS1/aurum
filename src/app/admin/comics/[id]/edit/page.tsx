import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ComicForm } from "@/components/admin/ComicForm";

export default async function EditComicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [comic, categories, series] = await Promise.all([
    prisma.comic.findUnique({
      where: { id },
      include: { categories: { select: { id: true, name: true } }, tags: { select: { id: true, name: true } } },
    }),
    prisma.comicCategory.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.comicSeries.findMany({ select: { id: true, title: true }, orderBy: { title: "asc" } }),
  ]);

  if (!comic) notFound();

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">แก้ไข</span>คอมมิค
        </h1>
        <p>{comic.title}</p>
      </div>
      <ComicForm categories={categories} series={series} initialComic={comic} />
    </section>
  );
}
