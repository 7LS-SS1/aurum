import { prisma } from "@/lib/prisma";
import { UploadDistribute } from "@/components/admin/UploadDistribute";

export default async function UploadPage() {
  const sites = await prisma.targetSite.findMany({
    where: { isActive: true },
    select: { id: true, name: true, baseUrl: true, postType: true, healthStatus: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">อัปโหลด</span> &amp; กระจายเนื้อหา
        </h1>
        <p>กรอกข้อมูลครั้งเดียว เลือกเว็บปลายทาง แล้วกระจายไปทุกเว็บ WordPress พร้อมกันผ่าน REST API</p>
      </div>
      <UploadDistribute sites={sites} />
    </section>
  );
}
