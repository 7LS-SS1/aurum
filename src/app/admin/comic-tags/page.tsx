import { prisma } from "@/lib/prisma";
import { ComicTagsManager } from "@/components/admin/ComicTagsManager";

const PAGE_SIZE = 20;

export default async function ComicTagsPage() {
  const [rows, total] = await Promise.all([
    prisma.comicTag.findMany({
      take: PAGE_SIZE,
      orderBy: { name: "asc" },
      include: { _count: { select: { comics: true } } },
    }),
    prisma.comicTag.count(),
  ]);
  const tags = rows.map((t) => ({ id: t.id, name: t.name, comicCount: t._count.comics }));

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">จัดการ</span>แท็กคอมมิค
        </h1>
        <p>แก้ไขชื่อหรือลบแท็ก — การเปลี่ยนแปลงจะมีผลกับทุกคอมมิคที่ใช้แท็กนั้นทันที</p>
      </div>
      <ComicTagsManager initialTags={tags} initialPagination={{ page: 1, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)), total, pageSize: PAGE_SIZE }} />
    </section>
  );
}
