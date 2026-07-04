import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { buildJwPlayerIframeUrl, getDefaultJwPlayerConfig } from "@/lib/jwplayer";
import { getDefaultVideoControllerConfig } from "@/lib/player-settings";
import { VideoPlayer } from "@/components/public/VideoPlayer";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "ร่าง",
  APPROVED: "พร้อมเผยแพร่",
  PUBLISHING: "กำลังเผยแพร่",
  DONE: "เผยแพร่แล้ว",
  PARTIAL: "เผยแพร่บางส่วน",
  REJECTED: "ต้องแก้ไข",
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getJsonRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

export default async function AdminVideoWatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [movie, suggestions] = await Promise.all([
    prisma.movie.findUnique({ where: { id } }),
    prisma.movie.findMany({
      where: {
        id: { not: id },
        OR: [{ videoUrl: { not: null } }, { jwPlayerMediaId: { not: null } }, { iframeUrl: { not: null } }],
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: {
        id: true,
        title: true,
        thumbnailUrl: true,
        mainCategory: true,
        status: true,
        createdAt: true,
        extraMeta: true,
      },
    }),
  ]);

  if (!movie || (!movie.videoUrl && !movie.jwPlayerMediaId && !movie.iframeUrl)) notFound();

  const iframeUrl =
    movie.iframeUrl ??
    (movie.videoProvider === "jwplayer" ? buildJwPlayerIframeUrl(movie.jwPlayerMediaId, await getDefaultJwPlayerConfig()) : undefined);
  const controller = await getDefaultVideoControllerConfig();
  const meta = getJsonRecord(movie.extraMeta);
  const tags = getStringArray(movie.tags);
  const categories = getStringArray(movie.categories);
  const description = movie.content || movie.excerpt || "ยังไม่มีรายละเอียดเพิ่มเติม";
  const duration = typeof meta.duration === "string" ? meta.duration : null;
  const quality = typeof meta.quality === "string" ? meta.quality : null;

  return (
    <section className="admin-watch-page">
      <div className="admin-watch-main">
        <div className="admin-watch-player">
          {iframeUrl ? (
            <iframe src={iframeUrl} title={movie.title} allowFullScreen />
          ) : (
            <VideoPlayer src={movie.videoUrl!} poster={movie.thumbnailUrl ?? undefined} controller={controller} />
          )}
        </div>

        <h1 className="admin-watch-title">{movie.title}</h1>

        <div className="admin-watch-meta-row">
          <div className="admin-watch-channel">
            <div className="chan-av">{(movie.mainCategory ?? "A").charAt(0)}</div>
            <div>
              <strong>{movie.mainCategory ?? "ไม่ระบุหมวดหมู่"}</strong>
              <span>
                {formatDate(movie.createdAt)}
                {quality ? ` · ${quality}` : ""}
                {duration ? ` · ${duration}` : ""}
              </span>
            </div>
          </div>

          <div className="admin-watch-actions">
            <span className="badge ok">{STATUS_LABEL[movie.status] ?? movie.status}</span>
            <Link className="watch-pill" href={`/admin/videos/${movie.id}/edit`}>
              แก้ไข
            </Link>
            <Link className="watch-pill" href={`/admin/videos/${movie.id}/preview`}>
              Preview
            </Link>
          </div>
        </div>

        <div className="admin-watch-description">
          <div className="admin-watch-description-head">
            <strong>{movie.slug ?? movie.id}</strong>
            <span>{movie.updatedAt ? `อัปเดต ${formatDate(movie.updatedAt)}` : ""}</span>
          </div>
          <p>{description}</p>
          {(tags.length > 0 || categories.length > 0) && (
            <div className="admin-watch-tags">
              {[...categories, ...tags].slice(0, 12).map((tag) => (
                <span key={tag}>#{tag}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      <aside className="admin-watch-side">
        <h2>วิดีโอแนะนำ</h2>
        <div className="admin-watch-suggestions">
          {suggestions.map((item) => {
            const itemMeta = getJsonRecord(item.extraMeta);
            const itemDuration = typeof itemMeta.duration === "string" ? itemMeta.duration : null;
            return (
              <Link key={item.id} className="admin-watch-suggestion" href={`/admin/videos/${item.id}`}>
                <div className="admin-watch-suggestion-thumb">
                  {item.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- admin thumbnails can come from configured CDN hosts
                    <img src={item.thumbnailUrl} alt={item.title} loading="lazy" />
                  ) : (
                    <div className="admin-thumb-fallback">{(item.mainCategory ?? "A").charAt(0)}</div>
                  )}
                  {itemDuration && <span>{itemDuration}</span>}
                </div>
                <div className="admin-watch-suggestion-info">
                  <strong>{item.title}</strong>
                  <span>{item.mainCategory ?? "ไม่ระบุหมวดหมู่"}</span>
                  <span>
                    {STATUS_LABEL[item.status] ?? item.status} · {formatDate(item.createdAt)}
                  </span>
                </div>
              </Link>
            );
          })}
          {suggestions.length === 0 && <p className="hint">ยังไม่มีวิดีโออื่นสำหรับแนะนำ</p>}
        </div>
      </aside>
    </section>
  );
}
