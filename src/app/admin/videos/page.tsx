import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { VideosManager } from "@/components/admin/VideosManager";

export default async function VideosPage() {
  const session = await auth();
  const role = session!.user.role;

  const [movies, users] = await Promise.all([
    prisma.movie.findMany({
      take: 20,
      orderBy: { createdAt: "desc" },
      include: { createdBy: { select: { id: true, name: true, email: true } } },
    }),
    prisma.user.findMany({ select: { id: true, name: true, email: true }, orderBy: { email: "asc" } }),
  ]);

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">วิดีโอทั้งหมด</span>
        </h1>
        <p>ภาพรวมวิดีโอทุกสถานะ ตั้งแต่ร่างจนถึงเผยแพร่ — action ที่ทำได้ขึ้นกับสิทธิ์ของคุณ</p>
      </div>
      <VideosManager
        initialMovies={JSON.parse(JSON.stringify(movies))}
        users={users}
        currentUserId={session!.user.id}
        role={role}
      />
    </section>
  );
}
