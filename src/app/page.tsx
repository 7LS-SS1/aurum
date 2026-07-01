import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PublicHeader } from "@/components/public/PublicHeader";

// RSC reads straight from the database — there is no public JSON API for
// this listing, which removes an entire class of scraping/abuse surface
// compared to exposing a `/api/public/movies` endpoint. Revalidated on an
// interval instead of per-request for speed.
export const revalidate = 60;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;

  const [movies, categories] = await Promise.all([
    prisma.movie.findMany({
      where: {
        status: { in: ["DONE", "PARTIAL"] },
        ...(category ? { mainCategory: category } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        slug: true,
        title: true,
        mainCategory: true,
        thumbnailUrl: true,
        extraMeta: true,
        createdAt: true,
      },
    }),
    prisma.movie.findMany({
      where: { status: { in: ["DONE", "PARTIAL"] } },
      distinct: ["mainCategory"],
      select: { mainCategory: true },
    }),
  ]);

  return (
    <>
      <PublicHeader />
      <main style={{ marginTop: "var(--topbar-h)" }}>
        <div className="chipbar">
          <Link className={`chip ${!category ? "active" : ""}`} href="/">
            ทั้งหมด
          </Link>
          {categories
            .map((c) => c.mainCategory)
            .filter((c): c is string => Boolean(c))
            .map((c) => (
              <Link key={c} className={`chip ${category === c ? "active" : ""}`} href={`/?category=${encodeURIComponent(c)}`}>
                {c}
              </Link>
            ))}
        </div>

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
                    {typeof meta.quality === "string" && <span className="badge-q">{meta.quality}</span>}
                    {typeof meta.duration === "string" && <span className="badge-dur">{meta.duration}</span>}
                  </div>
                  <div className="vmeta">
                    <div className="chan-av">{(m.mainCategory ?? "A").charAt(0)}</div>
                    <div className="vinfo">
                      <div className="vtitle">{m.title}</div>
                      <div className="vchannel">{m.mainCategory}</div>
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
