import { prisma } from "@/lib/prisma";
import { ComicsManager } from "@/components/admin/ComicsManager";

const PAGE_SIZE = 20;

export default async function ComicsPage() {
  const [comics, total] = await Promise.all([
    prisma.comic.findMany({
      take: PAGE_SIZE,
      orderBy: { createdAt: "desc" },
      include: { series: { select: { id: true, title: true } }, _count: { select: { chapters: true } } },
    }),
    prisma.comic.count(),
  ]);

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">คอมมิค</span>ทั้งหมด
        </h1>
        <p>จัดการคลังคอมมิค/โดจินของคุณ</p>
      </div>
      <ComicsManager
        initialComics={comics}
        initialPagination={{ page: 1, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)), total, pageSize: PAGE_SIZE }}
      />
    </section>
  );
}
