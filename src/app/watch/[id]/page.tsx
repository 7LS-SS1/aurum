import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PublicHeader } from "@/components/public/PublicHeader";
import { VideoPlayer } from "@/components/public/VideoPlayer";
import { buildJwPlayerIframeUrl, getDefaultJwPlayerConfig } from "@/lib/jwplayer";

export const revalidate = 60;

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const movie = await prisma.movie.findFirst({
    where: {
      status: { in: ["DONE", "PARTIAL"] },
      OR: [{ slug: id }, { id }],
    },
  });
  if (!movie || (!movie.videoUrl && !movie.jwPlayerMediaId && !movie.iframeUrl)) notFound();
  const iframeUrl =
    movie.iframeUrl ??
    (movie.videoProvider === "jwplayer" ? buildJwPlayerIframeUrl(movie.jwPlayerMediaId, await getDefaultJwPlayerConfig()) : undefined);

  const tags = Array.isArray(movie.tags) ? (movie.tags as unknown[]).filter((t): t is string => typeof t === "string") : [];

  return (
    <>
      <PublicHeader />
      <main style={{ marginTop: "var(--topbar-h)", maxWidth: 1100, margin: "var(--topbar-h) auto 0", padding: "24px" }}>
        <div style={{ aspectRatio: "16/9", background: "#000", borderRadius: 12, overflow: "hidden" }}>
          {iframeUrl ? (
            <iframe src={iframeUrl} title={movie.title} allowFullScreen style={{ width: "100%", height: "100%", border: 0 }} />
          ) : (
            <VideoPlayer src={movie.videoUrl!} poster={movie.thumbnailUrl ?? undefined} />
          )}
        </div>
        <h1 className="serif" style={{ fontSize: 22, marginTop: 18 }}>
          {movie.title}
        </h1>
        <div className="vchannel" style={{ marginTop: 6 }}>
          {movie.mainCategory}
        </div>
        {movie.excerpt && <p style={{ color: "var(--muted)", marginTop: 14, lineHeight: 1.7 }}>{movie.excerpt}</p>}
        {tags.length > 0 && (
          <div className="tag-suggest" style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            {tags.map((t) => (
              <span key={t} className="chip">
                {t}
              </span>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
