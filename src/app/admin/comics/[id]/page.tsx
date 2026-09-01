import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ComicDetailManager } from "@/components/admin/ComicDetailManager";

export default async function ComicDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const comic = await prisma.comic.findUnique({
    where: { id },
    include: {
      series: { select: { id: true, title: true } },
      categories: { select: { id: true, name: true } },
      tags: { select: { id: true, name: true } },
      chapters: { orderBy: { publishedAt: "desc" }, select: { id: true, number: true, title: true, publishedAt: true, _count: { select: { images: true } } } },
    },
  });

  if (!comic) notFound();

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">{comic.title}</span>
        </h1>
        <p>/{comic.slug}</p>
      </div>
      <ComicDetailManager initialComic={JSON.parse(JSON.stringify(comic))} />
    </section>
  );
}
