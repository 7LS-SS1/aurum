"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { can, type Role } from "@/lib/permissions";
import { DEFAULT_TAXO } from "@/lib/taxonomy";

type MovieStatus =
  | "DRAFT"
  | "READY_FOR_REVIEW"
  | "IN_REVIEW"
  | "REJECTED"
  | "READY_FOR_APPROVAL"
  | "APPROVED"
  | "PUBLISHING"
  | "DONE"
  | "PARTIAL"
  | "FAILED"
  | "ARCHIVED";

interface MovieRow {
  id: string;
  title: string;
  slug: string | null;
  mainCategory: string | null;
  status: MovieStatus;
  rejectionReason: string | null;
  targetSiteIds: unknown;
  createdAt: string;
  createdBy: { id: string; name: string | null; email: string } | null;
  reviewerId: string | null;
}

interface UserRow {
  id: string;
  name: string | null;
  email: string;
}

const STATUS_META: Record<MovieStatus, { label: string; cls: string }> = {
  DRAFT: { label: "ร่าง", cls: "neutral" },
  READY_FOR_REVIEW: { label: "รอตรวจ", cls: "gold" },
  IN_REVIEW: { label: "กำลังตรวจ", cls: "gold" },
  REJECTED: { label: "ถูกตีกลับ", cls: "bad" },
  READY_FOR_APPROVAL: { label: "รออนุมัติ", cls: "warn" },
  APPROVED: { label: "อนุมัติแล้ว", cls: "ok" },
  PUBLISHING: { label: "กำลังเผยแพร่", cls: "warn" },
  DONE: { label: "เผยแพร่สำเร็จ", cls: "ok" },
  PARTIAL: { label: "สำเร็จบางส่วน", cls: "warn" },
  FAILED: { label: "ล้มเหลว", cls: "bad" },
  ARCHIVED: { label: "เก็บถาวร", cls: "neutral" },
};

const ALL_STATUSES = Object.keys(STATUS_META) as MovieStatus[];

function siteIdsOf(movie: MovieRow): string[] {
  return Array.isArray(movie.targetSiteIds) ? (movie.targetSiteIds as string[]) : [];
}

export function VideosManager({
  initialMovies,
  users,
  currentUserId,
  role,
}: {
  initialMovies: MovieRow[];
  users: UserRow[];
  currentUserId: string;
  role: Role;
}) {
  const [movies, setMovies] = useState(initialMovies);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const [status, setStatus] = useState("");
  const [mainCategory, setMainCategory] = useState("");
  const [createdById, setCreatedById] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [q, setQ] = useState("");

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  function applyFilters() {
    startTransition(async () => {
      try {
        const params = new URLSearchParams();
        if (status) params.set("status", status);
        if (mainCategory) params.set("mainCategory", mainCategory);
        if (createdById) params.set("createdById", createdById);
        if (dateFrom) params.set("dateFrom", new Date(dateFrom).toISOString());
        if (dateTo) params.set("dateTo", new Date(dateTo).toISOString());
        if (q.trim()) params.set("q", q.trim());
        const res = await apiFetch<{ movies: MovieRow[] }>(`/api/movies?${params.toString()}`);
        setMovies(res.movies);
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "โหลดรายการไม่สำเร็จ");
      }
    });
  }

  function clearFilters() {
    setStatus("");
    setMainCategory("");
    setCreatedById("");
    setDateFrom("");
    setDateTo("");
    setQ("");
    startTransition(async () => {
      const res = await apiFetch<{ movies: MovieRow[] }>("/api/movies");
      setMovies(res.movies);
    });
  }

  async function run(id: string, label: string, fn: () => Promise<unknown>, refetchAfter = true) {
    setBusyId(id);
    try {
      await fn();
      notify(label);
      if (refetchAfter) applyFilters();
    } catch (err) {
      notify(err instanceof ApiClientError ? err.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  function submitReview(m: MovieRow) {
    run(m.id, "ส่งตรวจสอบแล้ว", () => apiFetch(`/api/movies/${m.id}/submit-review`, { method: "POST" }));
  }
  function startReview(m: MovieRow) {
    run(m.id, "เริ่มตรวจสอบแล้ว", () =>
      apiFetch(`/api/movies/${m.id}/review`, { method: "POST", body: JSON.stringify({ action: "start" }) }),
    );
  }
  function markReady(m: MovieRow) {
    run(m.id, "ทำเครื่องหมายพร้อมอนุมัติแล้ว", () =>
      apiFetch(`/api/movies/${m.id}/review`, { method: "POST", body: JSON.stringify({ action: "ready" }) }),
    );
  }
  function reject(m: MovieRow) {
    const reason = window.prompt("ระบุเหตุผลที่ปฏิเสธ (ส่งกลับให้ staff แก้ไข):");
    if (!reason || !reason.trim()) return;
    run(m.id, "ปฏิเสธแล้ว", () =>
      apiFetch(`/api/movies/${m.id}/reject`, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) }),
    );
  }
  function approve(m: MovieRow) {
    run(m.id, "อนุมัติแล้ว", () => apiFetch(`/api/movies/${m.id}/approve`, { method: "POST" }));
  }
  function archive(m: MovieRow) {
    if (!window.confirm("เก็บถาวรวิดีโอนี้?")) return;
    run(m.id, "เก็บถาวรแล้ว", () => apiFetch(`/api/movies/${m.id}/archive`, { method: "POST" }));
  }
  function publish(m: MovieRow) {
    const siteIds = siteIdsOf(m);
    if (!siteIds.length) return notify("ยังไม่ได้เลือกเว็บปลายทาง — แก้ไขวิดีโอก่อนเผยแพร่");
    run(m.id, "เผยแพร่แล้ว", () => apiFetch(`/api/movies/${m.id}/distribute`, { method: "POST", body: JSON.stringify({ siteIds }) }));
  }
  async function retry(m: MovieRow) {
    setBusyId(m.id);
    try {
      const distributions = await apiFetch<Array<{ siteId: string; status: string }>>(`/api/movies/${m.id}/status`);
      const failedIds = distributions.filter((d) => d.status === "FAILED").map((d) => d.siteId);
      if (!failedIds.length) {
        notify("ไม่มีเว็บที่ล้มเหลว");
        return;
      }
      await apiFetch(`/api/movies/${m.id}/distribute`, { method: "POST", body: JSON.stringify({ siteIds: failedIds }) });
      notify("ลองเผยแพร่ใหม่แล้ว");
      applyFilters();
    } catch (err) {
      notify(err instanceof ApiClientError ? err.message : "ลองใหม่ไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  function canEdit(m: MovieRow): boolean {
    if (!can(role, "movie:edit")) return false;
    if (role === "STAFF") {
      return m.createdBy?.id === currentUserId && ["DRAFT", "REJECTED", "READY_FOR_REVIEW"].includes(m.status);
    }
    if (role === "SENIOR") {
      return !["APPROVED", "PUBLISHING", "DONE", "PARTIAL", "FAILED", "ARCHIVED"].includes(m.status);
    }
    return true;
  }

  return (
    <div>
      <div className="filter-bar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </select>
        <select value={mainCategory} onChange={(e) => setMainCategory(e.target.value)}>
          <option value="">ทุกหมวดหมู่</option>
          {Object.keys(DEFAULT_TAXO).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={createdById} onChange={(e) => setCreatedById(e.target.value)}>
          <option value="">ทุกผู้สร้าง</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name ?? u.email}
            </option>
          ))}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อเรื่อง/slug" style={{ minWidth: 200 }} />
        <button className="btn btn-ghost" disabled={pending} onClick={applyFilters}>
          ค้นหา
        </button>
        <button className="btn btn-ghost" disabled={pending} onClick={clearFilters}>
          ล้างตัวกรอง
        </button>
        {can(role, "movie:create") && (
          <Link href="/admin/videos/new" className="btn btn-gold" style={{ marginLeft: "auto" }}>
            + เพิ่มวิดีโอใหม่
          </Link>
        )}
      </div>

      <div className="panel" style={{ overflowX: "auto" }}>
        {movies.length === 0 ? (
          <div className="empty">ไม่พบวิดีโอตามเงื่อนไข</div>
        ) : (
          <table className="dtable">
            <thead>
              <tr>
                <th>ชื่อเรื่อง</th>
                <th>หมวดหมู่</th>
                <th>สถานะ</th>
                <th>ผู้สร้าง</th>
                <th>วันที่สร้าง</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {movies.map((m) => {
                const meta = STATUS_META[m.status];
                const busy = busyId === m.id;
                return (
                  <tr key={m.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{m.title}</div>
                      {m.slug && <div style={{ fontSize: 12, color: "var(--muted-2)" }}>{m.slug}</div>}
                      {m.status === "REJECTED" && m.rejectionReason && (
                        <div style={{ fontSize: 12, color: "var(--red)", marginTop: 3 }}>เหตุผล: {m.rejectionReason}</div>
                      )}
                    </td>
                    <td>{m.mainCategory ?? "—"}</td>
                    <td>
                      <span className={`badge ${meta.cls}`}>{meta.label}</span>
                    </td>
                    <td>{m.createdBy?.name ?? m.createdBy?.email ?? "—"}</td>
                    <td>{new Date(m.createdAt).toLocaleDateString("th-TH")}</td>
                    <td>
                      <div className="actions">
                        {canEdit(m) && (
                          <Link href={`/admin/videos/${m.id}/edit`}>
                            <button disabled={busy}>แก้ไข</button>
                          </Link>
                        )}
                        {can(role, "movie:submit-review") &&
                          ["DRAFT", "REJECTED"].includes(m.status) &&
                          (role !== "STAFF" || m.createdBy?.id === currentUserId) && (
                            <button disabled={busy} onClick={() => submitReview(m)}>
                              ส่งตรวจ
                            </button>
                          )}
                        {can(role, "movie:review") && m.status === "READY_FOR_REVIEW" && (
                          <button disabled={busy} onClick={() => startReview(m)}>
                            เริ่มตรวจ
                          </button>
                        )}
                        {can(role, "movie:review") && m.status === "IN_REVIEW" && (
                          <button disabled={busy} onClick={() => markReady(m)}>
                            พร้อมอนุมัติ
                          </button>
                        )}
                        {can(role, "movie:reject") && m.status === "IN_REVIEW" && (
                          <button className="danger" disabled={busy} onClick={() => reject(m)}>
                            ปฏิเสธ
                          </button>
                        )}
                        {can(role, "movie:approve") && m.status === "READY_FOR_APPROVAL" && (
                          <button disabled={busy} onClick={() => approve(m)}>
                            อนุมัติ
                          </button>
                        )}
                        {can(role, "movie:publish") && m.status === "APPROVED" && (
                          <button disabled={busy} onClick={() => publish(m)}>
                            เผยแพร่
                          </button>
                        )}
                        {can(role, "movie:publish") && ["PARTIAL", "FAILED"].includes(m.status) && (
                          <button disabled={busy} onClick={() => retry(m)}>
                            ลองใหม่
                          </button>
                        )}
                        {can(role, "movie:archive") &&
                          ["APPROVED", "DONE", "PARTIAL", "FAILED", "REJECTED"].includes(m.status) && (
                            <button className="danger" disabled={busy} onClick={() => archive(m)}>
                              เก็บถาวร
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}
