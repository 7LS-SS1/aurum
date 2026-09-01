import { prisma } from "@/lib/prisma";
import { ComicCategoriesManager } from "@/components/admin/ComicCategoriesManager";

export default async function ComicCategoriesPage() {
  const categories = await prisma.comicCategory.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">หมวดหมู่คอมมิค</span>ทั้งหมด
        </h1>
        <p>จัดการรายชื่อหมวดหมู่ที่ใช้ในฟอร์มคอมมิค (แยกจากหมวดหมู่วิดีโอ)</p>
      </div>
      <ComicCategoriesManager initialCategories={categories} />
    </section>
  );
}
