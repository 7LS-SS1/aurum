import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AuditLogViewer } from "@/components/admin/AuditLogViewer";

export default async function AuditPage() {
  const session = await auth();
  if (session?.user.role !== "HEAD") redirect("/admin/videos");

  const logs = await prisma.auditLog.findMany({
    take: 50,
    orderBy: { createdAt: "desc" },
    include: { actor: { select: { id: true, name: true, email: true } } },
  });

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">Audit Log</span>
        </h1>
        <p>ประวัติการกระทำสำคัญทั้งหมดในระบบ — เฉพาะหัวหน้าฝ่ายเท่านั้นที่เข้าถึงได้</p>
      </div>
      <AuditLogViewer initialLogs={JSON.parse(JSON.stringify(logs))} />
    </section>
  );
}
