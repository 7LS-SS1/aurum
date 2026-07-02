import { prisma } from "@/lib/prisma";
import { VideoForm } from "@/components/admin/VideoForm";

export default async function NewVideoPage() {
  const sites = await prisma.targetSite.findMany({
    where: { isActive: true },
    select: { id: true, name: true, baseUrl: true, healthStatus: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">เพิ่มวิดีโอ</span>ใหม่
        </h1>
        <p>กรอกข้อมูล บันทึกร่าง หรือส่งตรวจสอบเพื่อเข้าสู่ขั้นตอนอนุมัติ</p>
      </div>
      <VideoForm sites={sites} />
    </section>
  );
}
