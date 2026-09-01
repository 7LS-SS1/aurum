"use client";

import { useState, useTransition } from "react";
import { apiFetch, ApiClientError } from "@/lib/api-client";

interface ComicCategoryRow {
  id: string;
  name: string;
}

export function ComicCategoriesManager({ initialCategories }: { initialCategories: ComicCategoryRow[] }) {
  const [categories, setCategories] = useState(initialCategories);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  function startEdit(c: ComicCategoryRow) {
    setEditingId(c.id);
    setEditingName(c.name);
  }

  function saveEdit() {
    if (!editingId) return;
    const name = editingName.trim();
    if (!name) return notify("กรุณากรอกชื่อหมวดหมู่");
    startTransition(async () => {
      try {
        const updated = await apiFetch<ComicCategoryRow>(`/api/comic-categories/${editingId}`, { method: "PATCH", body: JSON.stringify({ name }) });
        setCategories((prev) => prev.map((c) => (c.id === editingId ? updated : c)).sort((a, b) => a.name.localeCompare(b.name, "th")));
        setEditingId(null);
        notify("บันทึกแล้ว");
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "บันทึกไม่สำเร็จ");
      }
    });
  }

  function deleteCategory(id: string, name: string) {
    if (!confirm(`ลบหมวดหมู่ "${name}"? คอมมิคที่เคยเลือกหมวดหมู่นี้จะยังคงแสดงชื่อเดิมอยู่ ไม่มีผลย้อนหลัง`)) return;
    startTransition(async () => {
      try {
        await apiFetch(`/api/comic-categories/${id}`, { method: "DELETE" });
        setCategories((prev) => prev.filter((c) => c.id !== id));
        notify("ลบหมวดหมู่แล้ว");
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "ลบไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>หมวดหมู่คอมมิคทั้งหมด</h3>
        <span className="sub">{categories.length} หมวดหมู่</span>
      </div>
      {categories.length === 0 && <div className="empty">ยังไม่มีหมวดหมู่ในระบบ</div>}
      {categories.map((c) => (
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
                onClick={() => deleteCategory(c.id, c.name)}
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
