"use client";

import { useState, useTransition } from "react";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { can, type Role } from "@/lib/permissions";

interface SiteRow {
  id: string;
  name: string;
  baseUrl: string;
  postType: string;
  isActive: boolean;
  healthStatus: "OK" | "ERROR" | "UNKNOWN";
}

export function SitesManager({ initialSites, role }: { initialSites: SiteRow[]; role: Role }) {
  const [sites, setSites] = useState(initialSites);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canManage = can(role, "site:manage");
  const canDelete = can(role, "site:delete");

  const [form, setForm] = useState({ name: "", baseUrl: "", wpUsername: "", credential: "" });

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  function addSite(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.baseUrl || !form.credential) {
      notify("กรอก ชื่อ / URL / กุญแจ ให้ครบ");
      return;
    }
    startTransition(async () => {
      try {
        const site = await apiFetch<SiteRow>("/api/sites", {
          method: "POST",
          body: JSON.stringify({
            name: form.name,
            baseUrl: form.baseUrl,
            wpUsername: form.wpUsername,
            credential: form.credential,
          }),
        });
        setSites((prev) => [...prev, site]);
        setForm({ name: "", baseUrl: "", wpUsername: "", credential: "" });
        notify("เพิ่มเว็บแล้ว — กุญแจถูกเข้ารหัสที่ฝั่ง server");
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "บันทึกไม่สำเร็จ");
      }
    });
  }

  function pingSite(id: string) {
    startTransition(async () => {
      try {
        const { healthStatus } = await apiFetch<{ healthStatus: SiteRow["healthStatus"] }>(`/api/sites/${id}/ping`, {
          method: "POST",
        });
        setSites((prev) => prev.map((s) => (s.id === id ? { ...s, healthStatus } : s)));
        notify(healthStatus === "OK" ? "เชื่อมต่อสำเร็จ" : "เชื่อมต่อไม่สำเร็จ — ตรวจสอบกุญแจ/สิทธิ์ผู้ใช้");
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "ตรวจสอบไม่สำเร็จ");
      }
    });
  }

  function syncExistingMovies(id: string, name: string) {
    if (!confirm(`ซิงก์วิดีโอเก่าที่เผยแพร่แล้วทั้งหมดเข้า "${name}"? ระบบจะทยอยส่งเข้าเว็บนี้ทีละชุดผ่าน cron ไม่ใช่ทันที`)) return;
    startTransition(async () => {
      try {
        const result = await apiFetch<{ eligible: number; created: number; skipped: number }>(
          `/api/sites/${id}/sync-existing`,
          { method: "POST" },
        );
        notify(`สร้างงานซิงก์ใหม่ ${result.created} รายการ (ข้าม ${result.skipped} รายการที่มีอยู่แล้ว)`);
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "ซิงก์ไม่สำเร็จ");
      }
    });
  }

  function toggleActive(site: SiteRow) {
    startTransition(async () => {
      try {
        const updated = await apiFetch<SiteRow>(`/api/sites/${site.id}`, {
          method: "PATCH",
          body: JSON.stringify({ isActive: !site.isActive }),
        });
        setSites((prev) => prev.map((s) => (s.id === site.id ? updated : s)));
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "อัปเดตไม่สำเร็จ");
      }
    });
  }

  function deleteSite(id: string) {
    if (!confirm("ลบเว็บนี้? ประวัติการกระจายที่เชื่อมกับเว็บนี้จะถูกลบด้วย")) return;
    startTransition(async () => {
      try {
        await apiFetch(`/api/sites/${id}`, { method: "DELETE" });
        setSites((prev) => prev.filter((s) => s.id !== id));
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
          <span className="sub">{sites.length} เว็บ</span>
        </div>
        {sites.length === 0 && <div className="empty">ยังไม่มีเว็บปลายทาง{canManage ? " — เพิ่มจากฟอร์มด้านขวา" : ""}</div>}
        {sites.map((s) => (
          <div key={s.id} className="site-row" style={{ cursor: "default" }}>
            <span className={`health ${s.healthStatus}`} />
            <div className="site-info">
              <div className="nm">
                {s.name} {!s.isActive && <span className="badge neutral">ปิดใช้งาน</span>}
              </div>
              <div className="url">
                {s.baseUrl} · {s.postType}
              </div>
            </div>
            {canManage && (
              <button className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5 }} disabled={pending} onClick={() => pingSite(s.id)}>
                ตรวจสอบ
              </button>
            )}
            {canManage && s.isActive && (
              <button
                className="btn-ghost"
                style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5 }}
                disabled={pending}
                onClick={() => syncExistingMovies(s.id, s.name)}
                title="ส่งวิดีโอที่เผยแพร่แล้วทั้งหมดเข้าเว็บนี้ (สำหรับเว็บที่เพิ่งเพิ่มใหม่)"
              >
                ซิงก์วิดีโอเก่า
              </button>
            )}
            {canManage && (
              <button className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5 }} disabled={pending} onClick={() => toggleActive(s)}>
                {s.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
              </button>
            )}
            {canDelete && (
              <button className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5, color: "var(--red)" }} disabled={pending} onClick={() => deleteSite(s.id)}>
                ลบ
              </button>
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
            <form onSubmit={addSite}>
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
          </div>
        </div>
      )}

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}
