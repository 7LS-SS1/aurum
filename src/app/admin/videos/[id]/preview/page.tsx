import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { buildJwPlayerIframeUrl, getDefaultJwPlayerConfig } from "@/lib/jwplayer";
import { VideoPlayer } from "@/components/public/VideoPlayer";
import { getDefaultVideoControllerConfig } from "@/lib/player-settings";

export default async function AdminVideoPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const movie = await prisma.movie.findUnique({ where: { id } });

  if (!movie || (!movie.videoUrl && !movie.jwPlayerMediaId && !movie.iframeUrl)) notFound();

  const iframeUrl =
    movie.iframeUrl ??
    (movie.videoProvider === "jwplayer" ? buildJwPlayerIframeUrl(movie.jwPlayerMediaId, await getDefaultJwPlayerConfig()) : undefined);
  const controller = await getDefaultVideoControllerConfig();
  const tags = Array.isArray(movie.tags) ? (movie.tags as unknown[]).filter((tag): tag is string => typeof tag === "string") : [];

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">ตัวอย่าง</span>วิดีโอ
        </h1>
        <p>{movie.title}</p>
      </div>

      <div className="panel" style={{ marginBottom: 18 }}>
        <div style={{ aspectRatio: "16 / 9", background: "#000", borderRadius: 8, overflow: "hidden" }}>
          {iframeUrl ? (
            <iframe src={iframeUrl} title={movie.title} allowFullScreen style={{ width: "100%", height: "100%", border: 0 }} />
          ) : (
            <VideoPlayer src={movie.videoUrl!} poster={movie.thumbnailUrl ?? undefined} controller={controller} />
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="n">OK</span>
          <h3>เสร็จสิ้น</h3>
        </div>
        <p className="hint" style={{ marginBottom: 14 }}>
          วิดีโอนี้ถูกบันทึกแล้ว และระบบจะประมวลผล/เผยแพร่ต่อด้วยกระบวนการอัตโนมัติตามสถานะปัจจุบัน
        </p>
        <div className="row2">
          <div className="field">
            <label>สถานะ</label>
            <input value={movie.status} readOnly />
          </div>
          <div className="field">
            <label>หมวดหมู่หลัก</label>
            <input value={movie.mainCategory ?? "-"} readOnly />
          </div>
        </div>
        {movie.excerpt && (
          <div className="field">
            <label>เรื่องย่อ</label>
            <textarea value={movie.excerpt} readOnly />
          </div>
        )}
        {tags.length > 0 && (
          <div className="tagbox" style={{ marginBottom: 14 }}>
            {tags.map((tag) => (
              <span key={tag} className="tag">
                <b>{tag}</b>
              </span>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn btn-gold" href={`/admin/videos/${movie.id}/edit`}>
            แก้ไขวิดีโอ
          </Link>
          <Link className="btn btn-ghost" href="/admin/videos">
            กลับรายการวิดีโอ
          </Link>
        </div>
      </div>
    </section>
  );
}
