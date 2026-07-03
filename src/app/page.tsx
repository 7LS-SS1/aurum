import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PublicHeader } from "@/components/public/PublicHeader";

// RSC reads straight from the database. There is no public JSON API for
// this listing, which removes an entire class of scraping/abuse surface.
export const revalidate = 60;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const { category, q } = await searchParams;
  const query = q?.trim();
  const baseWhere: Prisma.MovieWhereInput = { status: { in: ["DONE", "PARTIAL"] } };
  const hrefFor = (nextCategory?: string) => {
    const params = new URLSearchParams();
    if (nextCategory) params.set("category", nextCategory);
    if (query) params.set("q", query);
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  };

  const [movies, categories] = await Promise.all([
    prisma.movie.findMany({
      where: {
        ...baseWhere,
        ...(category ? { mainCategory: category } : {}),
        ...(query
          ? {
              OR: [
                { title: { contains: query } },
                { mainCategory: { contains: query } },
                { excerpt: { contains: query } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        slug: true,
        title: true,
        mainCategory: true,
        thumbnailUrl: true,
        previewUrl: true,
        extraMeta: true,
        createdAt: true,
      },
    }),
    prisma.movie.findMany({
      where: baseWhere,
      distinct: ["mainCategory"],
      select: { mainCategory: true },
    }),
  ]);
  const categoryNames = categories.map((c) => c.mainCategory).filter((c): c is string => Boolean(c));

  return (
    <>
      <PublicHeader q={query ?? ""} />
      <aside className="public-sidebar">
        <div className="side-sec">
          <Link className={`side-link ${!category ? "active" : ""}`} href={hrefFor()}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 11.5 12 4l9 7.5M5 10v10h5v-6h4v6h5V10" />
            </svg>
            หน้าแรก
          </Link>
          <Link className="side-link" href="/">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 8v4l3 2M12 3a9 9 0 1 0 9 9" />
              <path d="M3 4v4h4" />
            </svg>
            มาใหม่
          </Link>
        </div>
        {categoryNames.length > 0 && (
          <div className="side-sec">
            <div className="side-cat">หมวดหมู่</div>
            {categoryNames.map((c) => (
              <Link key={c} className={`side-link ${category === c ? "active" : ""}`} href={hrefFor(c)}>
                <span className="ic">{c.charAt(0)}</span>
                {c}
              </Link>
            ))}
          </div>
        )}
        <div className="side-sec">
          <Link className="side-link premium-link" href="/">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.2L12 16.6 5.7 21l2.3-7.2-6-4.4h7.6z" />
            </svg>
            AURUM Premium
          </Link>
        </div>
      </aside>

      <main className="public-main">
        <div className="public-chipbar-wrap">
          <div className="chipbar">
            <Link className={`chip ${!category ? "active" : ""}`} href={hrefFor()}>
              ทั้งหมด
            </Link>
            {categoryNames.map((c) => (
              <Link key={c} className={`chip ${category === c ? "active" : ""}`} href={hrefFor(c)}>
                {c}
              </Link>
            ))}
          </div>
        </div>

        {(category || query) && (
          <div className="public-results-head">
            <div>
              <span>{query ? `ผลการค้นหา "${query}"` : "กำลังดูหมวดหมู่"}</span>
              {category && <b>{category}</b>}
            </div>
            <Link href="/" className="clear-filter">
              ล้างตัวกรอง
            </Link>
          </div>
        )}

        {movies.length === 0 ? (
          <div className="empty">ยังไม่มีเนื้อหา</div>
        ) : (
          <div className="grid">
            {movies.map((m) => {
              const meta = (m.extraMeta as Record<string, unknown>) ?? {};
              return (
                <Link key={m.id} className="vcard" href={`/watch/${m.slug ?? m.id}`}>
                  <div className="vthumb">
                    {m.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- external CDN hosts vary per env
                      <img src={m.thumbnailUrl} alt={m.title} loading="lazy" />
                    )}
                    {m.previewUrl && <video className="vpreview" src={m.previewUrl} muted loop playsInline autoPlay preload="metadata" />}
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
                    <div className="chan-av">{(m.mainCategory ?? "A").charAt(0)}</div>
                    <div className="vinfo">
                      <div className="vtitle">{m.title}</div>
                      <div className="vchannel">{m.mainCategory}</div>
                      <div className="vstats">{new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(m.createdAt)}</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
