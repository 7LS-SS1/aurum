import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { CommentsManager } from "@/components/admin/CommentsManager";

export default async function AdminCommentsPage() {
  const session = await auth();
  const role = session?.user?.role;
  if (!role || !can(role, "comment:moderate")) redirect("/admin/videos");

  const comments = await prisma.comment.findMany({
    take: 50,
    orderBy: { createdAt: "desc" },
    include: {
      viewer: { select: { displayName: true, email: true } },
      movie: { select: { title: true } },
    },
  });

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">คอมเมนต์</span>
        </h1>
        <p>ตรวจสอบและลบคอมเมนต์ของผู้ชมที่ไม่เหมาะสม — ตั้งแต่ระดับซีเนียร์ขึ้นไปเท่านั้นที่เข้าถึงได้</p>
      </div>
      <CommentsManager initialComments={JSON.parse(JSON.stringify(comments))} />
    </section>
  );
}
