"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { apiFetch, ApiClientError } from "@/lib/api-client";

interface ChapterRow {
  id: string;
  number: string;
  title: string | null;
  publishedAt: string;
  _count: { images: number };
}

interface ComicDetail {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  authorName: string | null;
  comicType: "MANGA" | "DOUJIN";
  status: "ONGOING" | "COMPLETED" | "HIATUS";
  isOneShot: boolean;
  coverImageUrl: string | null;
  series: { id: string; title: string } | null;
  categories: { id: string; name: string }[];
  tags: { id: string; name: string }[];
  chapters: ChapterRow[];
}

const STATUS_LABEL: Record<ComicDetail["status"], string> = {
  ONGOING: "กำลังดำเนินเรื่อง",
  COMPLETED: "จบแล้ว",
  HIATUS: "พักเรื่อง",
};

export function ComicDetailManager({ initialComic }: { initialComic: ComicDetail }) {
  const [comic, setComic] = useState(initialComic);
  const [showAddChapter, setShowAddChapter] = useState(false);
  const [chapterNumber, setChapterNumber] = useState("");
  const [chapterTitle, setChapterTitle] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  function addChapter(e: React.FormEvent) {
    e.preventDefault();
    if (!chapterNumber.trim()) return notify("กรุณากรอกเลขตอน");
    startTransition(async () => {
      try {
        await apiFetch("/api/comic-chapters", {
          method: "POST",
          body: JSON.stringify({ comicId: comic.id, number: chapterNumber.trim(), title: chapterTitle.trim() || undefined }),
        });
        const refreshed = await apiFetch<ComicDetail>(`/api/comics/${comic.id}`);
        setComic(refreshed);
        setChapterNumber("");
        setChapterTitle("");
        setShowAddChapter(false);
        notify("เพิ่มตอนแล้ว");
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "เพิ่มตอนไม่สำเร็จ");
      }
    });
  }

  function deleteChapter(id: string, number: string) {
    if (!confirm(`ลบตอนที่ ${number}? รูปภาพทั้งหมดในตอนนี้จะถูกลบด้วย`)) return;
    startTransition(async () => {
      try {
        await apiFetch(`/api/comic-chapters/${id}`, { method: "DELETE" });
        setComic((prev) => ({ ...prev, chapters: prev.chapters.filter((c) => c.id !== id) }));
        notify("ลบตอนแล้ว");
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "ลบไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="ad-grid">
      <div className="panel">
        <div className="panel-head">
          <h3>
            ตอน ({comic.chapters.length})
          </h3>
          <button className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5 }} onClick={() => setShowAddChapter((v) => !v)}>
            {showAddChapter ? "ยกเลิก" : "+ เพิ่มตอน"}
          </button>
        </div>

        {showAddChapter && (
          <form onSubmit={addChapter} className="filter-bar" style={{ padding: "0 12px 16px" }}>
            <input type="text" value={chapterNumber} onChange={(e) => setChapterNumber(e.target.value)} placeholder="เลขตอน เช่น 1, 1.5" style={{ maxWidth: 140 }} />
            <input type="text" value={chapterTitle} onChange={(e) => setChapterTitle(e.target.value)} placeholder="ชื่อตอน (ไม่บังคับ)" style={{ flex: 1, minWidth: 160 }} />
            <button className="btn btn-gold" type="submit" disabled={pending}>
              บันทึก
            </button>
          </form>
        )}

        {comic.chapters.length === 0 && <div className="empty">ยังไม่มีตอน</div>}
        {comic.chapters.map((ch) => (
          <div key={ch.id} className="site-row" style={{ cursor: "default" }}>
            <div className="site-info">
              <div className="nm">
                <Link href={`/admin/comics/${comic.id}/chapters/${ch.id}`}>
                  ตอนที่ {ch.number}
                  {ch.title ? ` - ${ch.title}` : ""}
                </Link>
              </div>
              <div className="url">
                {ch._count.images} รูปภาพ · {new Date(ch.publishedAt).toLocaleDateString("th-TH")}
              </div>
            </div>
            <Link className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5 }} href={`/admin/comics/${comic.id}/chapters/${ch.id}`}>
              จัดการรูปภาพ
            </Link>
            <button
              className="btn-ghost"
              style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5, color: "var(--red)" }}
              disabled={pending}
              onClick={() => deleteChapter(ch.id, ch.number)}
            >
              ลบ
            </button>
          </div>
        ))}
      </div>

      <div className="rail">
        <div className="panel">
          <div className="panel-head">
            <h3>ข้อมูลคอมมิค</h3>
          </div>
          <div style={{ padding: "0 12px 16px" }}>
            {comic.coverImageUrl ? (
              <div className="thumb-preview-card" style={{ marginBottom: 12 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={comic.coverImageUrl} alt={comic.title} />
              </div>
            ) : (
              <div className="thumb-empty" style={{ marginBottom: 12 }}>
                ยังไม่มีรูปปก
              </div>
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              <span className="badge neutral">{comic.comicType === "DOUJIN" ? "Doujin" : "Manga"}</span>
              <span className="badge neutral">{STATUS_LABEL[comic.status]}</span>
              {comic.isOneShot && <span className="badge neutral">One-shot</span>}
              {comic.series && <span className="badge neutral">{comic.series.title}</span>}
            </div>
            {comic.authorName && <p className="hint" style={{ marginBottom: 8 }}>โดย {comic.authorName}</p>}
            {comic.description && <p className="hint" style={{ marginBottom: 8 }}>{comic.description}</p>}
            {(comic.categories.length > 0 || comic.tags.length > 0) && (
              <div className="chipbar" style={{ padding: "6px 0 0", overflowX: "visible", flexWrap: "wrap" }}>
                {comic.categories.map((c) => (
                  <span key={c.id} className="chip active">
                    {c.name}
                  </span>
                ))}
                {comic.tags.map((t) => (
                  <span key={t.id} className="chip">
                    {t.name}
                  </span>
                ))}
              </div>
            )}
            <Link className="btn btn-ghost btn-block" style={{ marginTop: 14 }} href={`/admin/comics/${comic.id}/edit`}>
              แก้ไขคอมมิค
            </Link>
          </div>
        </div>
      </div>

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}
