"use client";

import { useState, useTransition } from "react";
import { apiFetch, ApiClientError } from "@/lib/api-client";

interface MainCategoryRow {
  id: string;
  name: string;
  movieCount: number;
}

export function MainCategoriesManager({ initialMainCategories }: { initialMainCategories: MainCategoryRow[] }) {
  const [mainCategories, setMainCategories] = useState(initialMainCategories);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  function startEdit(c: MainCategoryRow) {
    setEditingId(c.id);
    setEditingName(c.name);
  }

  function saveEdit() {
    if (!editingId) return;
    const name = editingName.trim();
    if (!name) return notify("กรุณากรอกชื่อหมวดหมู่หลัก");
    startTransition(async () => {
      try {
        const updated = await apiFetch<{ id: string; name: string }>(`/api/main-categories/${editingId}`, { method: "PATCH", body: JSON.stringify({ name }) });
        setMainCategories((prev) => prev.map((c) => (c.id === editingId ? { ...c, name: updated.name } : c)).sort((a, b) => a.name.localeCompare(b.name, "th")));
        setEditingId(null);
        notify("บันทึกแล้ว — วิดีโอที่เผยแพร่ไปแล้วจะยังใช้ชื่อเดิมจนกว่าจะแก้ไขทีละรายการ");
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "บันทึกไม่สำเร็จ");
      }
    });
  }

  function deleteMainCategory(id: string, name: string, movieCount: number) {
    const extra = movieCount > 0 ? ` (มี ${movieCount} วิดีโอในหมวดหมู่นี้)` : "";
    if (!confirm(`ลบหมวดหมู่หลัก "${name}"${extra}? วิดีโอที่เคยเลือกหมวดหมู่นี้จะยังคงแสดงชื่อเดิมอยู่ ไม่มีผลย้อนหลัง — ยืนยันการลบ?`)) return;
    startTransition(async () => {
      try {
        await apiFetch(`/api/main-categories/${id}`, { method: "DELETE" });
        setMainCategories((prev) => prev.filter((c) => c.id !== id));
        notify("ลบหมวดหมู่หลักแล้ว");
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "ลบไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>หมวดหมู่หลักทั้งหมด</h3>
        <span className="sub">{mainCategories.length} หมวดหมู่</span>
      </div>
      {mainCategories.length === 0 && <div className="empty">ยังไม่มีหมวดหมู่หลักในระบบ</div>}
      {mainCategories.map((c) => (
        <div key={c.id} className="site-row" style={{ cursor: "default" }}>
          {editingId === c.id ? (
            <input
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveEdit()}
              style={{ flex: 1 }}
              autoFocus
            />
          ) : (
            <div className="site-info">
              <div className="nm">{c.name}</div>
              <div className="url">{c.movieCount.toLocaleString("th-TH")} วิดีโอ</div>
            </div>
          )}
          {editingId === c.id ? (
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
              <button className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5 }} disabled={pending} onClick={() => startEdit(c)}>
                แก้ไข
              </button>
              <button
                className="btn-ghost"
                style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5, color: "var(--red)" }}
                disabled={pending}
                onClick={() => deleteMainCategory(c.id, c.name, c.movieCount)}
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
