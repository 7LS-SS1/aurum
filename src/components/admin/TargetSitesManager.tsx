"use client";

import { useState, useTransition } from "react";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { can, type Role } from "@/lib/permissions";
import { useSiteSyncJobs } from "@/components/admin/site-sync/useSiteSyncJobs";
import { SiteSyncIconButton, SiteSyncDetailPanel } from "@/components/admin/site-sync/SiteSyncRowControls";
import { SiteSyncToastStack, buildToastEntries } from "@/components/admin/site-sync/SiteSyncToastStack";

interface VideoSiteRow {
  id: string;
  name: string;
  baseUrl: string;
  postType: string;
  mainCategories: unknown;
  isActive: boolean;
  healthStatus: "OK" | "ERROR" | "UNKNOWN";
  createdAt: string;
}

interface ComicSiteRow {
  id: string;
  name: string;
  baseUrl: string;
  postType: string;
  comicTypes: unknown;
  isActive: boolean;
  healthStatus: "OK" | "ERROR" | "UNKNOWN";
  createdAt: string;
}

interface MainCategoryRow {
  id: string;
  name: string;
}

type SiteType = "video" | "doujin";
const COMIC_TYPE_LABEL: Record<string, string> = { MANGA: "Manga", DOUJIN: "Doujin" };

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export function TargetSitesManager({
  initialVideoSites,
  initialComicSites,
  mainCategories,
  role,
}: {
  initialVideoSites: VideoSiteRow[];
  initialComicSites: ComicSiteRow[];
  mainCategories: MainCategoryRow[];
  role: Role;
}) {
  const [videoSites, setVideoSites] = useState(initialVideoSites);
  const [comicSites, setComicSites] = useState(initialComicSites);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [selectedSiteIds, setSelectedSiteIds] = useState<Set<string>>(new Set());
  const [newSiteType, setNewSiteType] = useState<SiteType | null>(null);
  const [form, setForm] = useState({ name: "", baseUrl: "", wpUsername: "", credential: "" });

  const canManage = can(role, "site:manage");
  const canDelete = can(role, "site:delete");

  // Sync ("ซิงก์วิดีโอเก่า") only exists for video sites — no equivalent
  // distribution pipeline for Doujin/Comic yet.
  const sync = useSiteSyncJobs(videoSites);
  const siteNameById = Object.fromEntries(videoSites.map((s) => [s.id, s.name]));
  const toastEntries = buildToastEntries(sync.jobsBySite, siteNameById, sync.toastDismissed);

  const merged = [
    ...videoSites.map((s) => ({ ...s, type: "video" as const })),
    ...comicSites.map((s) => ({ ...s, type: "doujin" as const })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  function toggleSiteSelected(id: string) {
    setSelectedSiteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function syncSelectedSites() {
    const ids = [...selectedSiteIds].filter((id) => {
      const job = sync.jobsBySite[id];
      return !job || job.status === "COMPLETED" || job.status === "PARTIAL" || job.status === "FAILED" || job.status === "CANCELLED";
    });
    if (ids.length === 0) return;
    void sync.startSyncMany(ids);
  }

  function addSite(e: React.FormEvent) {
    e.preventDefault();
    if (!newSiteType) return;
    if (!form.name || !form.baseUrl || !form.credential) {
      notify("กรอก ชื่อ / URL / กุญแจ ให้ครบ");
      return;
    }
    startTransition(async () => {
      try {
        const endpoint = newSiteType === "video" ? "/api/sites" : "/api/comic-sites";
        const site = await apiFetch<VideoSiteRow | ComicSiteRow>(endpoint, {
          method: "POST",
          body: JSON.stringify({ name: form.name, baseUrl: form.baseUrl, wpUsername: form.wpUsername, credential: form.credential }),
        });
        if (newSiteType === "video") setVideoSites((prev) => [...prev, site as VideoSiteRow]);
        else setComicSites((prev) => [...prev, site as ComicSiteRow]);
        setForm({ name: "", baseUrl: "", wpUsername: "", credential: "" });
        setNewSiteType(null);
        notify("เพิ่มเว็บแล้ว — กุญแจถูกเข้ารหัสที่ฝั่ง server");
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "บันทึกไม่สำเร็จ");
      }
    });
  }

  function pingSite(id: string, type: SiteType) {
    startTransition(async () => {
      try {
        const endpoint = type === "video" ? `/api/sites/${id}/ping` : `/api/comic-sites/${id}/ping`;
        const { healthStatus } = await apiFetch<{ healthStatus: VideoSiteRow["healthStatus"] }>(endpoint, { method: "POST" });
        if (type === "video") setVideoSites((prev) => prev.map((s) => (s.id === id ? { ...s, healthStatus } : s)));
        else setComicSites((prev) => prev.map((s) => (s.id === id ? { ...s, healthStatus } : s)));
        notify(healthStatus === "OK" ? "เชื่อมต่อสำเร็จ" : "เชื่อมต่อไม่สำเร็จ — ตรวจสอบกุญแจ/สิทธิ์ผู้ใช้");
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "ตรวจสอบไม่สำเร็จ");
      }
    });
  }

  function syncBunnyReferrers() {
    startTransition(async () => {
      try {
        const result = await apiFetch<{ added: string[]; alreadyPresent: string[]; failed: { hostname: string; error: string }[] }>(
          "/api/sites/sync-bunny-referrers",
          { method: "POST" },
        );
        const parts = [`เพิ่มใหม่ ${result.added.length}`, `มีอยู่แล้ว ${result.alreadyPresent.length}`];
        if (result.failed.length > 0) parts.push(`ล้มเหลว ${result.failed.length} (${result.failed.map((f) => f.hostname).join(", ")})`);
        notify(parts.join(" · "));
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "ซิงก์ Bunny domain ไม่สำเร็จ");
      }
    });
  }

  function toggleActive(id: string, type: SiteType, isActive: boolean) {
    startTransition(async () => {
      try {
        const endpoint = type === "video" ? `/api/sites/${id}` : `/api/comic-sites/${id}`;
        const updated = await apiFetch<VideoSiteRow | ComicSiteRow>(endpoint, { method: "PATCH", body: JSON.stringify({ isActive: !isActive }) });
        if (type === "video") setVideoSites((prev) => prev.map((s) => (s.id === id ? (updated as VideoSiteRow) : s)));
        else setComicSites((prev) => prev.map((s) => (s.id === id ? (updated as ComicSiteRow) : s)));
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "อัปเดตไม่สำเร็จ");
      }
    });
  }

  function toggleSiteMainCategory(site: VideoSiteRow, name: string) {
    const current = toStringArray(site.mainCategories);
    const next = current.includes(name) ? current.filter((c) => c !== name) : [...current, name];
    startTransition(async () => {
      try {
        const updated = await apiFetch<VideoSiteRow>(`/api/sites/${site.id}`, { method: "PATCH", body: JSON.stringify({ mainCategories: next }) });
        setVideoSites((prev) => prev.map((s) => (s.id === site.id ? updated : s)));
        notify(next.length ? "ตั้งค่าหมวดหมู่หลักแล้ว — กด \"ซิงก์วิดีโอเก่า\" เพื่อดึงคลิปหมวดหมู่นี้ที่มีอยู่แล้วเข้าเว็บนี้" : "ตั้งเป็นรับทุกหมวดหมู่แล้ว");
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "อัปเดตหมวดหมู่ไม่สำเร็จ");
      }
    });
  }

  function toggleSiteComicType(site: ComicSiteRow, comicType: "MANGA" | "DOUJIN") {
    const current = toStringArray(site.comicTypes);
    const next = current.includes(comicType) ? current.filter((t) => t !== comicType) : [...current, comicType];
    startTransition(async () => {
      try {
        const updated = await apiFetch<ComicSiteRow>(`/api/comic-sites/${site.id}`, { method: "PATCH", body: JSON.stringify({ comicTypes: next }) });
        setComicSites((prev) => prev.map((s) => (s.id === site.id ? updated : s)));
        notify(next.length ? "ตั้งค่าประเภทที่รับแล้ว" : "ตั้งเป็นรับทุกประเภทแล้ว");
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "อัปเดตไม่สำเร็จ");
      }
    });
  }

  function deleteSite(id: string, type: SiteType) {
    if (!confirm("ลบเว็บนี้? ประวัติการกระจายที่เชื่อมกับเว็บนี้จะถูกลบด้วย")) return;
    startTransition(async () => {
      try {
        const endpoint = type === "video" ? `/api/sites/${id}` : `/api/comic-sites/${id}`;
        await apiFetch(endpoint, { method: "DELETE" });
        if (type === "video") setVideoSites((prev) => prev.filter((s) => s.id !== id));
        else setComicSites((prev) => prev.filter((s) => s.id !== id));
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "ลบไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="ad-grid">
      <div className="panel">
        <div className="panel-head">
          <h3>เว็บที่เชื่อมต่อ</h3>
          <span className="sub">
            {merged.length} เว็บ{selectedSiteIds.size > 0 ? ` · เลือก ${selectedSiteIds.size}` : ""}
          </span>
          {canManage && selectedSiteIds.size > 0 && (
            <button
              className="btn-ghost"
              style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5 }}
              disabled={pending}
              onClick={syncSelectedSites}
              title="เริ่มซิงก์วิดีโอเก่าให้ทุกเว็บวิดีโอที่เลือกพร้อมกัน แยก job และ progress ต่อเว็บ"
            >
              ซิงก์เว็บไซต์ที่เลือก ({selectedSiteIds.size})
            </button>
          )}
          {canManage && (
            <button
              className="btn-ghost"
              style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5 }}
              disabled={pending}
              onClick={syncBunnyReferrers}
              title="เพิ่ม domain ของเว็บวิดีโอที่เปิดใช้งานทั้งหมดเข้า Bunny Allowed Referrers เพื่อแก้ปัญหาวิดีโอเล่นไม่ได้ (403)"
            >
              Sync Bunny Domains
            </button>
          )}
        </div>
        {merged.length === 0 && <div className="empty">ยังไม่มีเว็บปลายทาง{canManage ? " — เพิ่มจากฟอร์มด้านขวา" : ""}</div>}
        {merged.map((s) => (
          <div key={`${s.type}-${s.id}`}>
            <div className="site-row" style={{ cursor: "default" }}>
              {canManage && s.type === "video" && s.isActive && (
                <input
                  type="checkbox"
                  className="cbox"
                  checked={selectedSiteIds.has(s.id)}
                  onChange={() => toggleSiteSelected(s.id)}
                  aria-label={`เลือก ${s.name} เพื่อซิงก์หลายเว็บพร้อมกัน`}
                />
              )}
              <span className={`health ${s.healthStatus}`} />
              <div className="site-info">
                <div className="nm">
                  {s.name} <span className={`badge ${s.type === "video" ? "gold" : "neutral"}`}>{s.type === "video" ? "วิดีโอ" : "โดจิน"}</span>{" "}
                  {!s.isActive && <span className="badge neutral">ปิดใช้งาน</span>}
                </div>
                <div className="url">
                  {s.baseUrl} · {s.postType}
                </div>
              </div>
              {canManage && s.type === "video" && s.isActive && (
                <SiteSyncIconButton job={sync.jobsBySite[s.id]} disabled={pending} onStart={() => sync.startSync(s.id)} />
              )}
              {canManage && (
                <button className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5 }} disabled={pending} onClick={() => pingSite(s.id, s.type)}>
                  ตรวจสอบ
                </button>
              )}
              {canManage && (
                <button className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5 }} disabled={pending} onClick={() => toggleActive(s.id, s.type, s.isActive)}>
                  {s.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                </button>
              )}
              {canDelete && (
                <button
                  className="btn-ghost"
                  style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5, color: "var(--red)" }}
                  disabled={pending}
                  onClick={() => deleteSite(s.id, s.type)}
                >
                  ลบ
                </button>
              )}
            </div>
            {canManage && s.type === "video" && (
              <div style={{ padding: "0 12px 12px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>หมวดหมู่หลักที่รับ:</span>
                {mainCategories.length === 0 && <span style={{ fontSize: 12, color: "var(--muted-2)" }}>ยังไม่มีหมวดหมู่หลักในระบบ</span>}
                {mainCategories.map((mc) => {
                  const active = toStringArray(s.mainCategories).includes(mc.name);
                  return (
                    <button key={mc.id} type="button" className={`chip ${active ? "active" : ""}`} disabled={pending} onClick={() => toggleSiteMainCategory(s, mc.name)}>
                      {mc.name}
                    </button>
                  );
                })}
                {toStringArray(s.mainCategories).length === 0 && <span style={{ fontSize: 12, color: "var(--muted-2)" }}>(ไม่จำกัด — รับทุกหมวดหมู่)</span>}
              </div>
            )}
            {canManage && s.type === "doujin" && (
              <div style={{ padding: "0 12px 12px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>ประเภทที่รับ:</span>
                {(["DOUJIN", "MANGA"] as const).map((type) => {
                  const active = toStringArray(s.comicTypes).includes(type);
                  return (
                    <button key={type} type="button" className={`chip ${active ? "active" : ""}`} disabled={pending} onClick={() => toggleSiteComicType(s, type)}>
                      {COMIC_TYPE_LABEL[type]}
                    </button>
                  );
                })}
                {toStringArray(s.comicTypes).length === 0 && <span style={{ fontSize: 12, color: "var(--muted-2)" }}>(ไม่จำกัด — รับทุกประเภท)</span>}
              </div>
            )}
            {canManage && s.type === "video" && s.isActive && (
              <div style={{ padding: "0 12px 16px" }}>
                <SiteSyncDetailPanel
                  job={sync.jobsBySite[s.id]}
                  logs={sync.jobsBySite[s.id] ? sync.logsByJob[sync.jobsBySite[s.id]!.id] ?? [] : []}
                  expanded={sync.expandedSiteId === s.id}
                  errorMessage={sync.errorsBySite[s.id]}
                  disabled={pending}
                  onCancel={() => sync.cancelSync(s.id)}
                  onRetry={() => sync.retrySync(s.id)}
                  onToggleLogs={() => sync.toggleLogPanel(s.id)}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {canManage && (
        <div className="rail">
          <div className="panel">
            <div className="panel-head">
              <span className="n">+</span>
              <h3>เพิ่มเว็บ</h3>
            </div>

            {!newSiteType ? (
              <div style={{ padding: "0 12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                <p className="hint">เลือกประเภทเนื้อหาสำหรับเว็บนี้ก่อน</p>
                <button type="button" className="btn btn-gold btn-block" onClick={() => setNewSiteType("video")}>
                  วิดีโอ
                </button>
                <button type="button" className="btn btn-ghost btn-block" onClick={() => setNewSiteType("doujin")}>
                  โดจิน/คอมมิค
                </button>
              </div>
            ) : (
              <form onSubmit={addSite}>
                <div style={{ padding: "0 12px 4px" }}>
                  <button type="button" className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5 }} onClick={() => setNewSiteType(null)}>
                    ‹ เปลี่ยนประเภท ({newSiteType === "video" ? "วิดีโอ" : "โดจิน/คอมมิค"})
                  </button>
                </div>
                <div className="field">
                  <label>
                    ชื่อเรียก <span className="req">*</span>
                  </label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Site A" />
                </div>
                <div className="field">
                  <label>
                    URL <span className="req">*</span>
                  </label>
                  <input type="url" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://site-a.com" />
                </div>
                <div className="field">
                  <label>WP Username</label>
                  <input type="text" value={form.wpUsername} onChange={(e) => setForm({ ...form, wpUsername: e.target.value })} placeholder="editor" />
                </div>
                <div className="field">
                  <label>
                    กุญแจ (App Password) <span className="req">*</span>
                  </label>
                  <input type="password" value={form.credential} onChange={(e) => setForm({ ...form, credential: e.target.value })} placeholder="xxxx xxxx xxxx xxxx" />
                  <div className="hint">เข้ารหัสด้วย AES-256-GCM ก่อนบันทึกเสมอ</div>
                </div>
                <button className="btn btn-gold btn-block" type="submit" disabled={pending}>
                  เพิ่มเว็บ
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
      <SiteSyncToastStack toasts={toastEntries} onDismiss={sync.dismissToast} />
    </div>
  );
}
