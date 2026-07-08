import Link from "next/link";
import { VideoCard, type VideoCardMovie } from "@/components/public/VideoCard";

export type CatalogMovie = VideoCardMovie;

export function VideoCatalog({
  movies,
  categories,
  category,
  query,
  basePath = "/",
  pagination,
}: {
  movies: CatalogMovie[];
  categories: string[];
  category?: string;
  query?: string;
  basePath?: "/" | "/videos";
  pagination?: { page: number; totalPages: number; total: number };
}) {
  const hrefFor = (nextCategory?: string, page?: number) => {
    const params = new URLSearchParams();
    if (nextCategory) params.set("category", nextCategory);
    if (query) params.set("q", query);
    if (page && page > 1) params.set("page", String(page));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <>
      <aside className="public-sidebar">
        <div className="side-sec">
          <Link className={`side-link ${basePath === "/" && !category ? "active" : ""}`} href="/">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 11.5 12 4l9 7.5M5 10v10h5v-6h4v6h5V10" />
            </svg>
            หน้าแรก
          </Link>
          <Link className={`side-link ${basePath === "/videos" && !category ? "active" : ""}`} href="/videos">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 8v4l3 2M12 3a9 9 0 1 0 9 9" />
              <path d="M3 4v4h4" />
            </svg>
            วิดีโอทั้งหมด
          </Link>
        </div>
        <div className="side-sec">
          <Link className="side-link" href="/library">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M3 12h18M3 18h12M18 14v7m-3.5-3.5h7" />
            </svg>
            ดูภายหลัง
          </Link>
          <Link className="side-link" href="/liked">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 10v11M2 13v6a2 2 0 0 0 2 2h12.3a2 2 0 0 0 2-1.6l1.4-7A2 2 0 0 0 17.7 10H13l1-4.5A2 2 0 0 0 12 3l-5 7" />
            </svg>
            วิดีโอที่ถูกใจ
          </Link>
        </div>
        {categories.length > 0 && (
          <div className="side-sec">
            <div className="side-cat">หมวดหมู่</div>
            {categories.map((c) => (
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
            {categories.map((c) => (
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
            <Link href={basePath} className="clear-filter">
              ล้างตัวกรอง
            </Link>
          </div>
        )}

        {movies.length === 0 ? (
          <div className="empty">ยังไม่มีเนื้อหา</div>
        ) : (
          <div className="grid">
            {movies.map((m) => (
              <VideoCard key={m.id} movie={m} />
            ))}
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <nav className="pagination" aria-label="Video pagination">
            <Link
              className={`page-btn ${pagination.page <= 1 ? "disabled" : ""}`}
              href={hrefFor(category, Math.max(1, pagination.page - 1))}
              aria-disabled={pagination.page <= 1}
            >
              ก่อนหน้า
            </Link>
            <span className="page-status">
              หน้า {pagination.page.toLocaleString("th-TH")} / {pagination.totalPages.toLocaleString("th-TH")}
            </span>
            <Link
              className={`page-btn ${pagination.page >= pagination.totalPages ? "disabled" : ""}`}
              href={hrefFor(category, Math.min(pagination.totalPages, pagination.page + 1))}
              aria-disabled={pagination.page >= pagination.totalPages}
            >
              ถัดไป
            </Link>
          </nav>
        )}
      </main>
    </>
  );
}
