import { prisma } from "@/lib/prisma";
import { ComicForm } from "@/components/admin/ComicForm";

export default async function NewComicPage() {
  const [categories, series] = await Promise.all([
    prisma.comicCategory.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.comicSeries.findMany({ select: { id: true, title: true }, orderBy: { title: "asc" } }),
  ]);

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">เพิ่มคอมมิค</span>ใหม่
        </h1>
        <p>กรอกข้อมูลคอมมิค แล้วเพิ่มตอน/รูปภาพได้จากหน้ารายละเอียดหลังบันทึก</p>
      </div>
      <ComicForm categories={categories} series={series} />
    </section>
  );
}
