import { prisma } from "@/lib/prisma";
import { NewVideosWizard } from "@/components/admin/NewVideosWizard";

export default async function NewVideoPage() {
  const [sites, categories, mainCategories, actors] = await Promise.all([
    prisma.targetSite.findMany({
      where: { isActive: true },
      select: { id: true, name: true, baseUrl: true, healthStatus: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.mainCategory.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.actor.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">เพิ่มวิดีโอ</span>ใหม่
        </h1>
        <p>เลือกหมวดหมู่หลัก ลากวางวิดีโอได้หลายไฟล์ กรอกรายละเอียดทีละคลิป แล้วเริ่มประมวลผลเพื่อดูตัวอย่าง</p>
      </div>
      <NewVideosWizard sites={sites} categories={categories} mainCategories={mainCategories} actors={actors} />
    </section>
  );
}
