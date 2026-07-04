import Link from "next/link";

export interface VideoCardMovie {
  id: string;
  slug: string | null;
  title: string;
  mainCategory: string | null;
  thumbnailUrl: string | null;
  previewUrl: string | null;
  extraMeta: unknown;
  createdAt: Date | string;
}

export function VideoCard({ movie }: { movie: VideoCardMovie }) {
  const meta = (movie.extraMeta as Record<string, unknown>) ?? {};
  const createdAt = typeof movie.createdAt === "string" ? new Date(movie.createdAt) : movie.createdAt;

  return (
    <Link className="vcard" href={`/watch/${movie.slug ?? movie.id}`}>
      <div className="vthumb">
        {movie.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- external CDN hosts vary per env
          <img src={movie.thumbnailUrl} alt={movie.title} loading="lazy" />
        )}
        {movie.previewUrl && <video className="vpreview" src={movie.previewUrl} muted loop playsInline autoPlay preload="metadata" />}
        <span className="hover-play">
          <span className="pp">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </span>
        {typeof meta.quality === "string" && <span className="badge-q">{meta.quality}</span>}
        {typeof meta.duration === "string" && <span className="badge-dur">{meta.duration}</span>}
      </div>
      <div className="vmeta">
        <div className="chan-av">{(movie.mainCategory ?? "A").charAt(0)}</div>
        <div className="vinfo">
          <div className="vtitle">{movie.title}</div>
          <div className="vchannel">{movie.mainCategory}</div>
          <div className="vstats">{new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(createdAt)}</div>
        </div>
      </div>
    </Link>
  );
}
