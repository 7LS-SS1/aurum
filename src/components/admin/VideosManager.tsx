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
  thumbnailUrl: string | null;
  previewUrl: string | null;
  viewCount: number;
  wpViewCount: number;
  extraMeta: unknown;
  targetSiteIds: unknown;
  status: MovieStatus;
  rejectionReason: string | null;
  createdAt: string;
  createdBy: { id: string; name: string | null; email: string } | null;
  reviewerId: string | null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

interface UserRow {
  id: string;
  name: string | null;
  email: string;
}

const STATUS_META: Record<MovieStatus, { label: string; cls: string }> = {
  DRAFT: { label: "รอเริ่มประมวลผล", cls: "neutral" },
  READY_FOR_REVIEW: { label: "กำลังประมวลผล", cls: "gold" },
  IN_REVIEW: { label: "กำลังประมวลผล", cls: "gold" },
  REJECTED: { label: "ต้องแก้ไข", cls: "bad" },
  READY_FOR_APPROVAL: { label: "กำลังประมวลผล", cls: "warn" },
  APPROVED: { label: "รอเผยแพร่อัตโนมัติ", cls: "ok" },
  PUBLISHING: { label: "กำลังเผยแพร่", cls: "warn" },
  DONE: { label: "เผยแพร่สำเร็จ", cls: "ok" },
  PARTIAL: { label: "สำเร็จบางส่วน", cls: "warn" },
  FAILED: { label: "ล้มเหลว", cls: "bad" },
  ARCHIVED: { label: "เก็บถาวร", cls: "neutral" },
};

const ALL_STATUSES = Object.keys(STATUS_META) as MovieStatus[];

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

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
        setSelectedIds(new Set());
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
      setSelectedIds(new Set());
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
    run(m.id, "เริ่มประมวลผลแล้ว", () => apiFetch(`/api/movies/${m.id}/submit-review`, { method: "POST" }));
  }

  function archive(m: MovieRow) {
    if (!window.confirm("เก็บถาวรวิดีโอนี้?")) return;
    run(m.id, "เก็บถาวรแล้ว", () => apiFetch(`/api/movies/${m.id}/archive`, { method: "POST" }));
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => (prev.size === movies.length ? new Set() : new Set(movies.map((movie) => movie.id))));
  }

  async function deleteMovie(m: MovieRow) {
    if (!window.confirm(`ลบวิดีโอ "${m.title}"? การลบนี้จะลบประวัติการกระจายและข้อมูลร่างที่เกี่ยวข้องด้วย`)) return;
    await run(m.id, "ลบวิดีโอแล้ว", () => apiFetch(`/api/movies/${m.id}`, { method: "DELETE" }));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(m.id);
      return next;
    });
  }

  async function deleteSelected() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`ลบวิดีโอที่เลือก ${ids.length} รายการ? การลบนี้จะลบประวัติการกระจายและข้อมูลร่างที่เกี่ยวข้องด้วย`)) return;

    setBulkBusy(true);
    try {
      await apiFetch("/api/movies/bulk-delete", { method: "POST", body: JSON.stringify({ ids }) });
      notify(`ลบวิดีโอแล้ว ${ids.length} รายการ`);
      setSelectedIds(new Set());
      applyFilters();
    } catch (err) {
      notify(err instanceof ApiClientError ? err.message : "ลบวิดีโอไม่สำเร็จ");
    } finally {
      setBulkBusy(false);
    }
  }

  function publishNow(m: MovieRow) {
    const siteIds = asStringArray(m.targetSiteIds);
    if (!siteIds.length) return notify("ยังไม่มีเว็บปลายทางที่เปิดใช้งาน — เพิ่มเว็บที่หน้า \"เว็บปลายทาง\" ก่อน");
    if (!window.confirm(`ส่ง "${m.title}" เข้า WordPress ทันที (${siteIds.length} เว็บ) — ยืนยัน?`)) return;
    run(m.id, "ส่งเข้า WordPress แล้ว", () => apiFetch(`/api/movies/${m.id}/distribute`, { method: "POST", body: JSON.stringify({ siteIds }) }));
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

  function renderActions(m: MovieRow) {
    const busy = busyId === m.id;
    const canDeleteMovie = can(role, "movie:delete") && m.status !== "PUBLISHING";
    return (
      <div className="admin-video-actions">
        {canEdit(m) && (
          <Link href={`/admin/videos/${m.id}/edit`}>
            <button disabled={busy}>แก้ไข</button>
          </Link>
        )}
        {can(role, "movie:submit-review") && ["DRAFT", "REJECTED"].includes(m.status) && (role !== "STAFF" || m.createdBy?.id === currentUserId) && (
          <button disabled={busy} onClick={() => submitReview(m)}>
            เริ่มประมวลผล
          </button>
        )}
        {can(role, "movie:publish") && m.status === "APPROVED" && (
          <button disabled={busy} onClick={() => publishNow(m)}>
            ส่งเข้า WordPress (ทดสอบ)
          </button>
        )}
        {can(role, "movie:publish") && ["PARTIAL", "FAILED"].includes(m.status) && (
          <button disabled={busy} onClick={() => retry(m)}>
            ลองใหม่
          </button>
        )}
        {can(role, "movie:archive") && ["APPROVED", "DONE", "PARTIAL", "FAILED", "REJECTED"].includes(m.status) && (
          <button className="danger" disabled={busy} onClick={() => archive(m)}>
            เก็บถาวร
          </button>
        )}
        {canDeleteMovie && (
          <button className="danger" disabled={busy || bulkBusy} onClick={() => deleteMovie(m)}>
            ลบ
          </button>
        )}
      </div>
    );
  }

  const canDeleteMovies = can(role, "movie:delete");
  const allVisibleSelected = movies.length > 0 && selectedIds.size === movies.length;

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

      <div className="admin-video-surface">
        {movies.length === 0 ? (
          <div className="empty">ไม่พบวิดีโอตามเงื่อนไข</div>
        ) : (
          <>
            {canDeleteMovies && (
              <div className="bulk-action-bar">
                <label className="bulk-select-all">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
                  <span>{allVisibleSelected ? "ยกเลิกเลือกทั้งหมด" : "เลือกทั้งหมด"}</span>
                </label>
                <span className="bulk-count">เลือกแล้ว {selectedIds.size} รายการ</span>
                <button className="btn btn-ghost danger-text" disabled={!selectedIds.size || bulkBusy} onClick={deleteSelected}>
                  {bulkBusy ? "กำลังลบ..." : "ลบรายการที่เลือก"}
                </button>
              </div>
            )}
            <div className="admin-video-grid">
              {movies.map((m) => {
                const statusMeta = STATUS_META[m.status];
                const mediaMeta = (m.extraMeta as Record<string, unknown>) ?? {};
                const totalViewCount = m.viewCount + m.wpViewCount;
                const checked = selectedIds.has(m.id);
                const selectable = canDeleteMovies && m.status !== "PUBLISHING";
                return (
                  <article key={m.id} className={`admin-video-card ${checked ? "selected" : ""}`}>
                    {canDeleteMovies && (
                      <label className={`admin-video-select ${!selectable ? "disabled" : ""}`}>
                        <input type="checkbox" checked={checked} disabled={!selectable || bulkBusy} onChange={() => toggleSelected(m.id)} />
                      </label>
                    )}
                  <Link className="vcard" href={`/admin/videos/${m.id}`}>
                    <div className="vthumb">
                      {m.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- admin preview supports CDN hosts from env
                        <img src={m.thumbnailUrl} alt={m.title} loading="lazy" />
                      ) : (
                        <div className="admin-thumb-fallback">{(m.mainCategory ?? "A").charAt(0)}</div>
                      )}
                      {m.previewUrl && <video className="vpreview" src={m.previewUrl} muted loop playsInline autoPlay preload="metadata" />}
                      <span className="hover-play">
                        <span className="pp">
                          <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </span>
                      </span>
                      <span className={`badge admin-thumb-status ${statusMeta.cls}`}>{statusMeta.label}</span>
                      {typeof mediaMeta.quality === "string" && <span className="badge-q">{mediaMeta.quality}</span>}
                      {typeof mediaMeta.duration === "string" && <span className="badge-dur">{mediaMeta.duration}</span>}
                    </div>
                  </Link>
                  <div className="admin-video-body">
                    <div className="admin-video-title-row">
                      <div className="chan-av">{(m.mainCategory ?? "A").charAt(0)}</div>
                      <div className="vinfo">
                        <Link href={`/admin/videos/${m.id}`} className="vtitle">
                          {m.title}
                        </Link>
                        <div className="vchannel">{m.mainCategory ?? "ไม่ระบุหมวดหมู่"}</div>
                        <div className="vstats admin-video-inline-meta">
                          <span>{totalViewCount.toLocaleString("th-TH")} views</span>
                          {m.wpViewCount > 0 && <span>WP {m.wpViewCount.toLocaleString("th-TH")}</span>}
                          <span>{new Date(m.createdAt).toLocaleDateString("th-TH")}</span>
                          <span>{m.createdBy?.name ?? m.createdBy?.email ?? "ไม่ระบุผู้สร้าง"}</span>
                        </div>
                      </div>
                    </div>
                    <div className="admin-video-card-meta">
                      {m.slug && <span className="admin-video-slug">{m.slug}</span>}
                    </div>
                    {m.status === "REJECTED" && m.rejectionReason && <div className="admin-video-reject">เหตุผล: {m.rejectionReason}</div>}
                    {renderActions(m)}
                  </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}
