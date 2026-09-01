import { prisma } from "@/lib/prisma";
import { TagsManager } from "@/components/admin/TagsManager";

const PAGE_SIZE = 20;

export default async function TagsPage() {
  const [rows, total] = await Promise.all([
    prisma.tag.findMany({
      take: PAGE_SIZE,
      orderBy: { name: "asc" },
      include: { _count: { select: { movies: true } } },
    }),
    prisma.tag.count(),
  ]);
  const tags = rows.map((t) => ({ id: t.id, name: t.name, movieCount: t._count.movies }));

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">จัดการ</span>แท็ก
        </h1>
        <p>แก้ไขชื่อหรือลบแท็ก — การเปลี่ยนแปลงจะมีผลกับทุกวิดีโอที่ใช้แท็กนั้นทันที</p>
      </div>
      <TagsManager initialTags={tags} initialPagination={{ page: 1, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)), total, pageSize: PAGE_SIZE }} />
    </section>
  );
}
