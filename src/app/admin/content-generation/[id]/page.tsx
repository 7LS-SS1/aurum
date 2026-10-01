import { notFound } from "next/navigation";
import { requireMinRole } from "@/lib/authz";
import { getContentGenerationJob } from "@/lib/content-generation/job-service";
import { ContentGenerationReview } from "@/components/admin/ContentGenerationReview";

export default async function ContentGenerationJobPage({ params }: { params: Promise<{ id: string }> }) {
  await requireMinRole("MANAGER");
  const { id } = await params;
  const job = await getContentGenerationJob(id);
  if (!job) notFound();
  return (
    <section>
      <div className="page-head">
        <h1><span className="g">ตรวจเนื้อหา AI</span></h1>
        <p>แก้ไขและอนุมัติเป็นรายเว็บไซต์ การอนุมัติในหน้านี้ยังไม่ส่งข้อมูลไป WordPress</p>
      </div>
      <ContentGenerationReview initialJob={JSON.parse(JSON.stringify(job))} />
    </section>
  );
}
