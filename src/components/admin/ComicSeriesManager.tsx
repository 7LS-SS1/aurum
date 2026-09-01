"use client";

import { useState, useTransition } from "react";
import { apiFetch, ApiClientError } from "@/lib/api-client";

interface ComicSeriesRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
}

export function ComicSeriesManager({ initialSeries }: { initialSeries: ComicSeriesRow[] }) {
  const [series, setSeries] = useState(initialSeries);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  function startEdit(s: ComicSeriesRow) {
    setEditingId(s.id);
    setEditingTitle(s.title);
  }

  function saveEdit() {
    if (!editingId) return;
    const title = editingTitle.trim();
    if (!title) return notify("กรุณากรอกชื่อซีรีส์");
    startTransition(async () => {
      try {
        const updated = await apiFetch<ComicSeriesRow>(`/api/comic-series/${editingId}`, { method: "PATCH", body: JSON.stringify({ title }) });
        setSeries((prev) => prev.map((s) => (s.id === editingId ? updated : s)).sort((a, b) => a.title.localeCompare(b.title, "th")));
        setEditingId(null);
        notify("บันทึกแล้ว");
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "บันทึกไม่สำเร็จ");
      }
    });
  }

  function deleteSeries(id: string, title: string) {
    if (!confirm(`ลบซีรีส์ "${title}"? คอมมิคในซีรีส์นี้จะยังอยู่ แต่จะไม่ผูกกับซีรีส์นี้อีก`)) return;
    startTransition(async () => {
      try {
        await apiFetch(`/api/comic-series/${id}`, { method: "DELETE" });
        setSeries((prev) => prev.filter((s) => s.id !== id));
        notify("ลบซีรีส์แล้ว");
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "ลบไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>ซีรีส์ทั้งหมด</h3>
        <span className="sub">{series.length} ซีรีส์</span>
      </div>
      {series.length === 0 && <div className="empty">ยังไม่มีซีรีส์ในระบบ</div>}
      {series.map((s) => (
        <div key={s.id} className="site-row" style={{ cursor: "default" }}>
          {editingId === s.id ? (
            <input
              type="text"
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveEdit()}
              style={{ flex: 1 }}
              autoFocus
            />
          ) : (
            <div className="site-info">
              <div className="nm">{s.title}</div>
              <div className="url">/{s.slug}</div>
            </div>
          )}
          {editingId === s.id ? (
            <>
              <button className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5 }} disabled={pending} onClick={saveEdit}>
                บันทึก
              </button>
              <button className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5 }} onClick={() => setEditingId(null)}>
                ยกเลิก
              </button>
            </>
          ) : (
            <>
              <button className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5 }} disabled={pending} onClick={() => startEdit(s)}>
                แก้ไข
              </button>
              <button
                className="btn-ghost"
                style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5, color: "var(--red)" }}
                disabled={pending}
                onClick={() => deleteSeries(s.id, s.title)}
              >
                ลบ
              </button>
            </>
          )}
        </div>
      ))}
      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}
