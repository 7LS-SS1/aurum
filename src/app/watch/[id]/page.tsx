import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { PublicHeader } from "@/components/public/PublicHeader";
import { VideoPlayer } from "@/components/public/VideoPlayer";
import { EngagementBar } from "@/components/public/EngagementBar";
import { CommentSection, type CommentRow } from "@/components/public/CommentSection";
import { ViewBeacon } from "@/components/public/ViewBeacon";
import { buildJwPlayerIframeUrl, getDefaultJwPlayerConfig } from "@/lib/jwplayer";
import { getDefaultVideoControllerConfig } from "@/lib/player-settings";
import { resolvePublicMovie } from "@/lib/public-movie";
import { getViewerFromCookies } from "@/lib/viewer-auth";

export const revalidate = 60;

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const movie = await resolvePublicMovie(id);
  if (!movie || (!movie.videoUrl && !movie.jwPlayerMediaId && !movie.iframeUrl)) notFound();

  const [iframePlayer, controller, viewer, reactionCounts, comments, suggestions] = await Promise.all([
    movie.videoProvider === "jwplayer" ? getDefaultJwPlayerConfig() : Promise.resolve(undefined),
    getDefaultVideoControllerConfig(),
    getViewerFromCookies(),
    prisma.movieReaction.groupBy({ by: ["type"], where: { movieId: movie.id }, _count: { _all: true } }),
    prisma.comment.findMany({
      where: { movieId: movie.id },
      take: 20,
      orderBy: { createdAt: "desc" },
      include: { viewer: { select: { displayName: true } } },
    }),
    prisma.movie.findMany({
      where: {
        id: { not: movie.id },
        status: { in: ["DONE", "PARTIAL"] },
        OR: [{ videoUrl: { not: null } }, { jwPlayerMediaId: { not: null } }, { iframeUrl: { not: null } }],
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { id: true, slug: true, title: true, thumbnailUrl: true, mainCategory: true },
    }),
  ]);

  const viewerOwnReaction = viewer
    ? await prisma.movieReaction.findUnique({ where: { movieId_viewerId: { movieId: movie.id, viewerId: viewer.id } } })
    : null;

  const likes = reactionCounts.find((r) => r.type === "LIKE")?._count._all ?? 0;
  const dislikes = reactionCounts.find((r) => r.type === "DISLIKE")?._count._all ?? 0;

  const iframeUrl = movie.iframeUrl ?? (movie.videoProvider === "jwplayer" ? buildJwPlayerIframeUrl(movie.jwPlayerMediaId, iframePlayer) : undefined);

  const tags = Array.isArray(movie.tags) ? (movie.tags as unknown[]).filter((t): t is string => typeof t === "string") : [];
  const meta = (movie.extraMeta as Record<string, unknown>) ?? {};
  const quality = typeof meta.quality === "string" ? meta.quality : null;
  const duration = typeof meta.duration === "string" ? meta.duration : null;
  const movieKey = movie.slug ?? movie.id;
  const totalViewCount = movie.viewCount + movie.wpViewCount;
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  const protocol = headerList.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const watchUrl = host ? `${protocol}://${host}/watch/${encodeURIComponent(movieKey)}` : `/watch/${encodeURIComponent(movieKey)}`;
  const embedTitle = movie.title.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const embedCode = `<iframe src="${watchUrl}" title="${embedTitle}" width="100%" height="480" frameborder="0" allowfullscreen></iframe>`;

  return (
    <>
      <PublicHeader />
      <ViewBeacon movieKey={movieKey} />
      <main className="watch">
        <div className="player-col">
          <div className="video-stage-wrap">
            {iframeUrl ? (
              <iframe src={iframeUrl} title={movie.title} allowFullScreen style={{ width: "100%", height: "100%", border: 0 }} />
            ) : (
              <VideoPlayer src={movie.videoUrl!} poster={movie.thumbnailUrl ?? undefined} controller={controller} />
            )}
          </div>

          <h1 className="w-title serif">{movie.title}</h1>

          <div className="channel-row">
            <div className="ch-block">
              <div>
                <div className="ch-name">{movie.mainCategory ?? "ไม่ระบุหมวดหมู่"}</div>
                <div className="ch-subs">
                  {totalViewCount.toLocaleString("th-TH")} ครั้ง
                  {quality ? ` · ${quality}` : ""}
                  {duration ? ` · ${duration}` : ""}
                </div>
              </div>
            </div>
            <EngagementBar
              movieKey={movieKey}
              initialLikes={likes}
              initialDislikes={dislikes}
              initialViewerReaction={(viewerOwnReaction?.type ?? null) as "LIKE" | "DISLIKE" | null}
              isLoggedIn={Boolean(viewer)}
              embedCode={embedCode}
            />
          </div>

          {movie.excerpt && (
            <div className="descbox">
              <div className="desc-body open">{movie.content || movie.excerpt}</div>
              {tags.length > 0 && (
                <div className="desc-tags">
                  {tags.map((t) => (
                    <span key={t} className="tag">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <CommentSection
            movieKey={movieKey}
            initialComments={comments as unknown as CommentRow[]}
            isLoggedIn={Boolean(viewer)}
            viewerId={viewer?.id}
          />
        </div>

        <aside className="rail">
          <div className="rail-head">
            <span className="dot" />
            วิดีโอแนะนำ
          </div>
          {suggestions.map((s) => (
            <Link key={s.id} className="rrow" href={`/watch/${s.slug ?? s.id}`}>
              <div className="rthumb">
                {s.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- external CDN hosts vary per env
                  <img src={s.thumbnailUrl} alt={s.title} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                )}
              </div>
              <div className="rinfo">
                <div className="rttl">{s.title}</div>
                <div className="rchan">{s.mainCategory ?? "ไม่ระบุหมวดหมู่"}</div>
              </div>
            </Link>
          ))}
          {suggestions.length === 0 && <p className="hint">ยังไม่มีวิดีโออื่นสำหรับแนะนำ</p>}
        </aside>
      </main>
    </>
  );
}
