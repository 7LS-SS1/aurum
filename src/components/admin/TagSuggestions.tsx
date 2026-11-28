"use client";
import { useEffect, useState } from "react";

interface PopularTag { tag: string; count: number }
interface TrendingTag { tag: string; recent: number; previous: number; growth: number }
type Tab = "popular" | "trending" | "suggested";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "trending", label: "🔥 กำลังมาแรง" },
  { key: "popular", label: "ยอดนิยมตลอดกาล" },
  { key: "suggested", label: "แนะนำจากชื่อเรื่อง" },
];
const DAYS = [1, 7, 30] as const;

/**
 * Tag picker shortcuts: all-time popular, trending (usage growth over the
 * last 1/7/30 days vs the period before), and existing tags that match the
 * current title. Clicking a chip toggles it; "เพิ่มทั้งหมด" adds the visible list.
 */
export function TagSuggestions({ selected, title, popular, onAdd, onRemove }: {
  selected: string[];
  title: string;
  popular: PopularTag[] | null;
  onAdd: (csv: string) => void;
  onRemove: (tag: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("trending");
  const [days, setDays] = useState<(typeof DAYS)[number]>(7);
  const [trending, setTrending] = useState<TrendingTag[] | null>(null);
  const [suggested, setSuggested] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setTrending(null);
    fetch(`/api/tags/trending?days=${days}`).then((res) => res.ok ? res.json() : null)
      .then((body) => { if (!cancelled) setTrending(body?.trending ?? []); })
      .catch(() => { if (!cancelled) setTrending([]); });
    return () => { cancelled = true; };
  }, [days]);

  useEffect(() => {
    if (!title.trim()) { setSuggested([]); return; }
    const timer = setTimeout(() => {
      fetch(`/api/tags/trending?days=${days}&title=${encodeURIComponent(title.slice(0, 500))}`).then((res) => res.ok ? res.json() : null)
        .then((body) => setSuggested(body?.suggested ?? []))
        .catch(() => setSuggested([]));
    }, 500);
    return () => clearTimeout(timer);
  }, [title, days]);

  const list: Array<{ tag: string; hint?: string }> =
    tab === "popular" ? (popular ?? []).map((row) => ({ tag: row.tag, hint: `${row.count}` }))
    : tab === "trending" ? (trending ?? []).map((row) => ({ tag: row.tag, hint: row.previous === 0 ? "ใหม่" : `+${Math.round(row.growth * 100)}%` }))
    : suggested.map((tag) => ({ tag }));
  const missing = list.map((row) => row.tag).filter((tag) => !selected.includes(tag));
  const loading = tab === "trending" && trending === null;
  const empty = tab === "trending" ? "ยังไม่มีแท็กที่ใช้เพิ่มขึ้นในช่วงนี้" : tab === "suggested" ? (title.trim() ? "ไม่พบแท็กที่ตรงกับชื่อเรื่อง" : "กรอกชื่อเรื่องก่อน ระบบจะแนะนำแท็กที่เกี่ยวข้อง") : "ยังไม่มีข้อมูลแท็ก";

  return (
    <div className="tag-suggest">
      <div className="tag-suggest__bar">
        <div className="tag-suggest__tabs" role="tablist" aria-label="แหล่งแท็กแนะนำ">
          {TABS.map((item) => (
            <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={`tag-suggest__tab ${tab === item.key ? "is-active" : ""}`} onClick={() => setTab(item.key)}>
              {item.label}{item.key === "suggested" && suggested.length ? ` (${suggested.length})` : ""}
            </button>
          ))}
        </div>
        {tab === "trending" && (
          <div className="tag-suggest__tabs" aria-label="ช่วงเวลา">
            {DAYS.map((value) => <button key={value} type="button" className={`tag-suggest__tab ${days === value ? "is-active" : ""}`} onClick={() => setDays(value)}>{value === 1 ? "24 ชม." : `${value} วัน`}</button>)}
          </div>
        )}
      </div>

      {loading ? <p className="tag-suggest__empty">กำลังโหลด…</p> : list.length === 0 ? <p className="tag-suggest__empty">{empty}</p> : (
        <>
          <div className="chipbar" style={{ padding: "8px 0 0", flexWrap: "wrap" }}>
            {list.map(({ tag, hint }) => {
              const active = selected.includes(tag);
              return (
                <button key={tag} type="button" className={`chip ${active ? "active" : ""}`} onClick={() => (active ? onRemove(tag) : onAdd(tag))}>
                  {tag}{hint && <span className="tag-suggest__hint">{hint}</span>}
                </button>
              );
            })}
          </div>
          <button type="button" className="btn-ghost tag-suggest__all" disabled={!missing.length} onClick={() => onAdd(missing.join(","))}>
            {missing.length ? `เพิ่มทั้งหมด (${missing.length} แท็ก)` : "เพิ่มครบแล้ว"}
          </button>
        </>
      )}
    </div>
  );
}
