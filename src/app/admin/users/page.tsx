import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { UsersManager } from "@/components/admin/UsersManager";

const MANAGEABLE_ROLES = ["STAFF", "SENIOR", "MANAGER"] as const;

export default async function AdminUsersPage() {
  const session = await auth();
  if (session?.user.role !== "HEAD") redirect("/admin/videos");

  const users = await prisma.user.findMany({
    where: { role: { in: [...MANAGEABLE_ROLES] } },
    select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true },
    orderBy: [{ role: "desc" }, { email: "asc" }],
  });

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">จัดการผู้ใช้</span>
        </h1>
        <p>HEAD สามารถเพิ่ม แก้ไข ตั้งค่า และลบผู้ใช้ระดับ MANAGER, SENIOR, STAFF ได้</p>
      </div>
      <UsersManager initialUsers={JSON.parse(JSON.stringify(users))} />
    </section>
  );
}
