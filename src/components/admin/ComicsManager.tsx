"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { apiFetch, ApiClientError } from "@/lib/api-client";

interface ComicRow {
  id: string;
  slug: string;
  title: string;
  comicType: "MANGA" | "DOUJIN";
  status: "ONGOING" | "COMPLETED" | "HIATUS";
  coverImageUrl: string | null;
  authorName: string | null;
  series: { id: string; title: string } | null;
  _count: { chapters: number };
}

interface PaginationState {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
}

const STATUS_LABEL: Record<ComicRow["status"], string> = {
  ONGOING: "กำลังดำเนินเรื่อง",
  COMPLETED: "จบแล้ว",
  HIATUS: "พักเรื่อง",
};

export function ComicsManager({ initialComics, initialPagination }: { initialComics: ComicRow[]; initialPagination: PaginationState }) {
  const [comics, setComics] = useState(initialComics);
  const [pagination, setPagination] = useState(initialPagination);
  const [q, setQ] = useState("");
  const [comicType, setComicType] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  async function fetchPage(page: number, query = q, type = comicType) {
    const params = new URLSearchParams({ page: String(page), take: String(pagination.pageSize) });
    if (query.trim()) params.set("q", query.trim());
    if (type) params.set("comicType", type);
    const res = await apiFetch<{ comics: ComicRow[]; pagination: PaginationState }>(`/api/comics?${params.toString()}`);
    setComics(res.comics);
    setPagination(res.pagination);
  }

  function applyFilters() {
    startTransition(async () => {
      try {
        await fetchPage(1);
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "ค้นหาไม่สำเร็จ");
      }
    });
  }

  function goToPage(page: number) {
    if (page < 1 || page > pagination.totalPages || page === pagination.page) return;
    startTransition(async () => {
      try {
        await fetchPage(page);
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "โหลดข้อมูลไม่สำเร็จ");
      }
    });
  }

  function deleteComic(id: string, title: string) {
    if (!confirm(`ลบคอมมิค "${title}"? ตอนและรูปภาพทั้งหมดจะถูกลบด้วย`)) return;
    startTransition(async () => {
      try {
        await apiFetch(`/api/comics/${id}`, { method: "DELETE" });
        setComics((prev) => prev.filter((c) => c.id !== id));
        notify("ลบคอมมิคแล้ว");
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "ลบไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>คอมมิคทั้งหมด</h3>
        <span className="sub">{pagination.total.toLocaleString("th-TH")} เรื่อง</span>
      </div>

      <div className="filter-bar" style={{ padding: "0 12px 12px" }}>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyFilters()}
          placeholder="ค้นหาชื่อเรื่อง/slug"
          style={{ minWidth: 200 }}
        />
        <select value={comicType} onChange={(e) => setComicType(e.target.value)}>
          <option value="">ทุกประเภท</option>
          <option value="MANGA">Manga</option>
          <option value="DOUJIN">Doujin</option>
        </select>
        <button className="btn btn-ghost" disabled={pending} onClick={applyFilters}>
          ค้นหา
        </button>
      </div>

      {comics.length === 0 && <div className="empty">ยังไม่มีคอมมิคในระบบ</div>}
      {comics.map((c) => (
        <div key={c.id} className="site-row" style={{ cursor: "default" }}>
          {c.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.coverImageUrl} alt={c.title} style={{ width: 36, height: 48, borderRadius: 6, objectFit: "cover", flex: "none" }} />
          ) : (
            <span className="health OK" />
          )}
          <div className="site-info">
            <div className="nm">
              <Link href={`/admin/comics/${c.id}`}>{c.title}</Link>{" "}
              <span className="badge neutral">{c.comicType === "DOUJIN" ? "Doujin" : "Manga"}</span>{" "}
              <span className="badge neutral">{STATUS_LABEL[c.status]}</span>
            </div>
            <div className="url">
              /{c.slug} · {c._count.chapters} ตอน{c.series ? ` · ${c.series.title}` : ""}
              {c.authorName ? ` · ${c.authorName}` : ""}
            </div>
          </div>
          <Link className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5 }} href={`/admin/comics/${c.id}`}>
            จัดการ
          </Link>
          <Link className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5 }} href={`/admin/comics/${c.id}/edit`}>
            แก้ไข
          </Link>
          <button
            className="btn-ghost"
            style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5, color: "var(--red)" }}
            disabled={pending}
            onClick={() => deleteComic(c.id, c.title)}
          >
            ลบ
          </button>
        </div>
      ))}

      {pagination.totalPages > 1 && (
        <nav className="pagination admin-pagination" aria-label="Comics pagination">
          <button className="page-btn" disabled={pending || pagination.page <= 1} onClick={() => goToPage(pagination.page - 1)}>
            ก่อนหน้า
          </button>
          <span className="page-status">
            หน้า {pagination.page.toLocaleString("th-TH")} / {pagination.totalPages.toLocaleString("th-TH")}
          </span>
          <button className="page-btn" disabled={pending || pagination.page >= pagination.totalPages} onClick={() => goToPage(pagination.page + 1)}>
            ถัดไป
          </button>
        </nav>
      )}
      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}
