import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { VideosManager } from "@/components/admin/VideosManager";

const PAGE_SIZE = 20;

export default async function VideosPage() {
  const session = await auth();
  const role = session!.user.role;

  const [movies, total, users] = await Promise.all([
    prisma.movie.findMany({
      take: PAGE_SIZE,
      orderBy: { createdAt: "desc" },
      include: { createdBy: { select: { id: true, name: true, email: true } } },
    }),
    prisma.movie.count(),
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
        initialPagination={{ page: 1, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)), total, pageSize: PAGE_SIZE }}
      />
    </section>
  );
}
