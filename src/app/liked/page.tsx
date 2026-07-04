import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PublicHeader } from "@/components/public/PublicHeader";
import { VideoCard } from "@/components/public/VideoCard";
import { getViewerFromCookies } from "@/lib/viewer-auth";

export default async function LikedPage() {
  const viewer = await getViewerFromCookies();
  if (!viewer) redirect("/login?callbackUrl=/liked");

  const rows = await prisma.movieReaction.findMany({
    where: { viewerId: viewer.id, type: "LIKE" },
    orderBy: { createdAt: "desc" },
    include: { movie: true },
  });

  return (
    <>
      <PublicHeader />
      <main className="public-main" style={{ marginLeft: 0, padding: "24px" }}>
        <div className="public-results-head" style={{ padding: 0, marginBottom: 16 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: "var(--text)" }}>วิดีโอที่ถูกใจ</span>
        </div>
        {rows.length === 0 ? (
          <div className="empty">ยังไม่มีวิดีโอที่ถูกใจ — กดปุ่ม &quot;ถูกใจ&quot; ในหน้าดูวิดีโอเพื่อเพิ่ม</div>
        ) : (
          <div className="grid" style={{ padding: 0 }}>
            {rows.map((r) => (
              <VideoCard key={r.id} movie={r.movie} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
