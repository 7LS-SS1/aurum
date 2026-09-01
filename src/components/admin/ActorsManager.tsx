"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { apiFetch, ApiClientError } from "@/lib/api-client";

interface ActorRow {
  id: string;
  name: string;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  profileImageUrl: string | null;
}

interface PaginationState {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
}

export function ActorsManager({ initialActors, initialPagination }: { initialActors: ActorRow[]; initialPagination: PaginationState }) {
  const [actors, setActors] = useState(initialActors);
  const [pagination, setPagination] = useState(initialPagination);
  const [q, setQ] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  async function fetchPage(page: number, query = q) {
    const params = new URLSearchParams({ page: String(page), take: String(pagination.pageSize) });
    if (query.trim()) params.set("q", query.trim());
    const res = await apiFetch<{ actors: ActorRow[]; pagination: PaginationState }>(`/api/actors?${params.toString()}`);
    setActors(res.actors);
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

  function deleteActor(id: string, name: string) {
    if (!confirm(`ลบนักแสดง "${name}"? วิดีโอที่เชื่อมกับนักแสดงคนนี้จะไม่ถูกลบ แต่จะไม่แสดงชื่อนักแสดงคนนี้อีก`)) return;
    startTransition(async () => {
      try {
        await apiFetch(`/api/actors/${id}`, { method: "DELETE" });
        setActors((prev) => prev.filter((a) => a.id !== id));
        notify("ลบนักแสดงแล้ว");
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "ลบไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>นักแสดงทั้งหมด</h3>
        <span className="sub">{pagination.total.toLocaleString("th-TH")} คน</span>
      </div>
      <form onSubmit={onSearch} className="filter-bar" style={{ padding: "0 12px 12px" }}>
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อนักแสดง" style={{ flex: 1 }} />
        <button className="btn btn-ghost" type="submit" disabled={pending}>
          ค้นหา
        </button>
      </form>
      {actors.length === 0 && <div className="empty">ยังไม่มีนักแสดงในระบบ</div>}
      {actors.map((a) => (
        <div key={a.id} className="site-row" style={{ cursor: "default" }}>
          {a.profileImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.profileImageUrl} alt={a.name} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
          ) : (
            <span className="health OK" />
          )}
          <div className="site-info">
            <div className="nm">{a.name}</div>
            <div className="url">
              {a.age ? `${a.age} ปี` : "-"} · {a.heightCm ? `${a.heightCm} ซม.` : "-"} · {a.weightKg ? `${a.weightKg} กก.` : "-"}
            </div>
          </div>
          <Link className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5 }} href={`/admin/actors/${a.id}/edit`}>
            แก้ไข
          </Link>
          <button
            className="btn-ghost"
            style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5, color: "var(--red)" }}
            disabled={pending}
            onClick={() => deleteActor(a.id, a.name)}
          >
            ลบ
          </button>
        </div>
      ))}
      {pagination.totalPages > 1 && (
        <nav className="pagination admin-pagination" aria-label="Actors pagination">
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
