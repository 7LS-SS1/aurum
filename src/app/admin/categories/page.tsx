import { prisma } from "@/lib/prisma";
import { CategoriesManager } from "@/components/admin/CategoriesManager";

export default async function CategoriesPage() {
  const categories = await prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">หมวดหมู่</span>ทั้งหมด
        </h1>
        <p>จัดการรายชื่อหมวดหมู่ที่ใช้ในฟอร์มอัปโหลดวิดีโอ</p>
      </div>
      <CategoriesManager initialCategories={categories} />
    </section>
  );
}
