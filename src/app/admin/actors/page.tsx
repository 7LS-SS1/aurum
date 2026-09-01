import { prisma } from "@/lib/prisma";
import { ActorsManager } from "@/components/admin/ActorsManager";

const PAGE_SIZE = 20;

export default async function ActorsPage() {
  const [actors, total] = await Promise.all([
    prisma.actor.findMany({
      take: PAGE_SIZE,
      orderBy: { name: "asc" },
      select: { id: true, name: true, age: true, heightCm: true, weightKg: true, profileImageUrl: true },
    }),
    prisma.actor.count(),
  ]);

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">นักแสดง</span>ทั้งหมด
        </h1>
        <p>รายชื่อนักแสดง — ดู แก้ไข หรือลบ</p>
      </div>
      <ActorsManager
        initialActors={actors}
        initialPagination={{ page: 1, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)), total, pageSize: PAGE_SIZE }}
      />
    </section>
  );
}
