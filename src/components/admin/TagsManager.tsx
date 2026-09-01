"use client";

import { useState, useTransition } from "react";
import { apiFetch, ApiClientError } from "@/lib/api-client";

interface TagRow {
  id: string;
  name: string;
  movieCount: number;
}

interface PaginationState {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
}

export function TagsManager({ initialTags, initialPagination }: { initialTags: TagRow[]; initialPagination: PaginationState }) {
  const [tags, setTags] = useState(initialTags);
  const [pagination, setPagination] = useState(initialPagination);
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  async function fetchPage(page: number, query = q) {
    const params = new URLSearchParams({ page: String(page), take: String(pagination.pageSize) });
    if (query.trim()) params.set("q", query.trim());
    const res = await apiFetch<{ tags: TagRow[]; pagination: PaginationState }>(`/api/tags?${params.toString()}`);
    setTags(res.tags);
    setPagination(res.pagination);
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

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await fetchPage(1, q);
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "ค้นหาไม่สำเร็จ");
      }
    });
  }

  function startEdit(t: TagRow) {
    setEditingId(t.id);
    setEditingName(t.name);
  }

  function saveEdit() {
    if (!editingId) return;
    const name = editingName.trim();
    if (!name) return notify("กรุณากรอกชื่อแท็ก");
    startTransition(async () => {
      try {
        const updated = await apiFetch<{ id: string; name: string }>(`/api/tags/${editingId}`, { method: "PATCH", body: JSON.stringify({ name }) });
        setTags((prev) => prev.map((t) => (t.id === editingId ? { ...t, name: updated.name } : t)));
        setEditingId(null);
        notify("บันทึกแล้ว — อัปเดตทุกวิดีโอที่ใช้แท็กนี้แล้ว");
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "บันทึกไม่สำเร็จ");
      }
    });
  }

  function deleteTag(id: string, name: string, movieCount: number) {
    const extra = movieCount > 0 ? ` (ใช้อยู่ใน ${movieCount} วิดีโอ)` : "";
    if (!confirm(`ลบแท็ก "${name}"${extra}? แท็กนี้จะถูกลบออกจากทุกวิดีโอที่ใช้อยู่`)) return;
    startTransition(async () => {
      try {
        await apiFetch(`/api/tags/${id}`, { method: "DELETE" });
        setTags((prev) => prev.filter((t) => t.id !== id));
        notify("ลบแท็กแล้ว");
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "ลบไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>จัดการแท็ก</h3>
        <span className="sub">{pagination.total.toLocaleString("th-TH")} แท็ก</span>
      </div>
      <form onSubmit={onSearch} className="filter-bar" style={{ padding: "0 12px 12px" }}>
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาแท็ก" style={{ flex: 1 }} />
        <button className="btn btn-ghost" type="submit" disabled={pending}>
          ค้นหา
        </button>
      </form>
      {tags.length === 0 && <div className="empty">ยังไม่มีแท็กในระบบ</div>}
      {tags.map((t) => (
        <div key={t.id} className="site-row" style={{ cursor: "default" }}>
          {editingId === t.id ? (
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
              <div className="nm">{t.name}</div>
              <div className="url">ใช้ใน {t.movieCount.toLocaleString("th-TH")} วิดีโอ</div>
            </div>
          )}
          {editingId === t.id ? (
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
              <button className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5 }} disabled={pending} onClick={() => startEdit(t)}>
                แก้ไข
              </button>
              <button
                className="btn-ghost"
                style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5, color: "var(--red)" }}
                disabled={pending}
                onClick={() => deleteTag(t.id, t.name, t.movieCount)}
              >
                ลบ
              </button>
            </>
          )}
        </div>
      ))}
      {pagination.totalPages > 1 && (
        <nav className="pagination admin-pagination" aria-label="Tags pagination">
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
