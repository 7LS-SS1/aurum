import { prisma } from "@/lib/prisma";
import { MainCategoriesManager } from "@/components/admin/MainCategoriesManager";

export default async function MainCategoriesPage() {
  const [mainCategories, counts] = await Promise.all([
    prisma.mainCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.movie.groupBy({ by: ["mainCategory"], _count: { _all: true } }),
  ]);

  const countByName = new Map(counts.map((c) => [c.mainCategory, c._count._all]));
  const rows = mainCategories.map((c) => ({ id: c.id, name: c.name, movieCount: countByName.get(c.name) ?? 0 }));

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">หมวดหมู่หลัก</span>ทั้งหมด
        </h1>
        <p>จัดการหมวดหมู่หลักที่ใช้ตอนอัปโหลดวิดีโอ (เช่น คลิปหลุด, AV)</p>
      </div>
      <MainCategoriesManager initialMainCategories={rows} />
    </section>
  );
}
