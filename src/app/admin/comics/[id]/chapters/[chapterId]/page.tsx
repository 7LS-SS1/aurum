import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ChapterImagesManager } from "@/components/admin/ChapterImagesManager";

export default async function ChapterDetailPage({ params }: { params: Promise<{ id: string; chapterId: string }> }) {
  const { id, chapterId } = await params;

  const chapter = await prisma.comicChapter.findUnique({
    where: { id: chapterId },
    include: { comic: { select: { id: true, title: true } }, images: { orderBy: { sortOrder: "asc" }, select: { id: true, imageUrl: true, sortOrder: true } } },
  });

  if (!chapter || chapter.comicId !== id) notFound();

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">{chapter.comic.title}</span> — ตอนที่ {chapter.number}
          {chapter.title ? `: ${chapter.title}` : ""}
        </h1>
        <p>
          <Link href={`/admin/comics/${id}`}>&larr; กลับไปหน้าคอมมิค</Link>
        </p>
      </div>
      <ChapterImagesManager chapterId={chapter.id} initialImages={chapter.images} />
    </section>
  );
}
