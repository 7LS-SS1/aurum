"use client";

import { useState, useTransition } from "react";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { can, type Role } from "@/lib/permissions";

interface PlayerConfigRow {
  id: string;
  provider: string;
  name: string;
  playerId: string;
  libraryUrl: string | null;
  defaultPosterMode: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
}

export function PlayerManager({ initialConfigs, role }: { initialConfigs: PlayerConfigRow[]; role: Role }) {
  const [configs, setConfigs] = useState(initialConfigs);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const [previewMediaId, setPreviewMediaId] = useState("");

  const canManage = can(role, "player:manage");
  const canDelete = can(role, "player:delete");

  const [form, setForm] = useState({
    name: "",
    playerId: "",
    libraryUrl: "",
    apiKey: "",
    apiSecret: "",
    defaultPosterMode: "auto",
    isDefault: false,
  });

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  function createConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.playerId || !form.apiKey) {
      notify("กรอก ชื่อ / Player ID / API Key ให้ครบ");
      return;
    }
    startTransition(async () => {
      try {
        const config = await apiFetch<PlayerConfigRow>("/api/player", {
          method: "POST",
          body: JSON.stringify({
            name: form.name,
            playerId: form.playerId,
            libraryUrl: form.libraryUrl || undefined,
            apiKey: form.apiKey,
            apiSecret: form.apiSecret || undefined,
            defaultPosterMode: form.defaultPosterMode,
            isDefault: form.isDefault,
          }),
        });
        setConfigs((prev) => [...prev, config]);
        setForm({ name: "", playerId: "", libraryUrl: "", apiKey: "", apiSecret: "", defaultPosterMode: "auto", isDefault: false });
        notify("เพิ่ม config แล้ว — กุญแจถูกเข้ารหัสที่ฝั่ง server");
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "บันทึกไม่สำเร็จ");
      }
    });
  }

  function toggleActive(cfg: PlayerConfigRow) {
    startTransition(async () => {
      try {
        const updated = await apiFetch<PlayerConfigRow>(`/api/player/${cfg.id}`, {
          method: "PATCH",
          body: JSON.stringify({ isActive: !cfg.isActive }),
        });
        setConfigs((prev) => prev.map((c) => (c.id === cfg.id ? updated : c)));
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "อัปเดตไม่สำเร็จ");
      }
    });
  }

  function makeDefault(cfg: PlayerConfigRow) {
    startTransition(async () => {
      try {
        await apiFetch(`/api/player/${cfg.id}`, { method: "PATCH", body: JSON.stringify({ isDefault: true }) });
        setConfigs((prev) => prev.map((c) => ({ ...c, isDefault: c.id === cfg.id })));
        notify("ตั้งเป็นค่าเริ่มต้นแล้ว");
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "อัปเดตไม่สำเร็จ");
      }
    });
  }

  function deleteConfig(id: string) {
    if (!confirm("ลบ config นี้?")) return;
    startTransition(async () => {
      try {
        await apiFetch(`/api/player/${id}`, { method: "DELETE" });
        setConfigs((prev) => prev.filter((c) => c.id !== id));
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "ลบไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="ad-grid">
      <div className="panel">
        <div className="panel-head">
          <h3>Player Configs</h3>
          <span className="sub">{configs.length} config</span>
        </div>
        {configs.length === 0 && <div className="empty">ยังไม่มี config — เพิ่มจากฟอร์มด้านขวา</div>}
        {configs.map((c) => (
          <div key={c.id}>
            <div className="site-row" style={{ cursor: "default" }}>
              <span className={`health ${c.isActive ? "OK" : "ERROR"}`} />
              <div className="site-info">
                <div className="nm">
                  {c.name} {c.isDefault && <span className="badge gold">ค่าเริ่มต้น</span>}
                </div>
                <div className="url">
                  {c.provider} · playerId: {c.playerId} · poster: {c.defaultPosterMode}
                </div>
              </div>
              <button className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5 }} onClick={() => setPreviewFor(previewFor === c.id ? null : c.id)}>
                ทดสอบ
              </button>
              {canManage && !c.isDefault && (
                <button className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5 }} disabled={pending} onClick={() => makeDefault(c)}>
                  ตั้งเป็นหลัก
                </button>
              )}
              {canManage && (
                <button className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5 }} disabled={pending} onClick={() => toggleActive(c)}>
                  {c.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                </button>
              )}
              {canDelete && (
                <button className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5, color: "var(--red)" }} disabled={pending} onClick={() => deleteConfig(c.id)}>
                  ลบ
                </button>
              )}
            </div>
            {previewFor === c.id && (
              <div style={{ padding: "0 12px 16px" }}>
                <div className="field" style={{ marginBottom: 10 }}>
                  <label>Media ID สำหรับทดสอบ</label>
                  <input type="text" value={previewMediaId} onChange={(e) => setPreviewMediaId(e.target.value)} placeholder="เช่น AbCdEfGh" />
                </div>
                {previewMediaId.trim() && (
                  <iframe
                    title={`preview-${c.id}`}
                    src={`https://cdn.jwplayer.com/players/${previewMediaId.trim()}-${c.playerId}.html`}
                    style={{ width: "100%", aspectRatio: "16/9", border: "1px solid var(--line)", borderRadius: 10 }}
                    allowFullScreen
                  />
                )}
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
              <h3>เพิ่ม Config</h3>
            </div>
            <form onSubmit={createConfig}>
              <div className="field">
                <label>
                  ชื่อเรียก <span className="req">*</span>
                </label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Main JWPlayer" />
              </div>
              <div className="field">
                <label>
                  Player ID <span className="req">*</span>
                </label>
                <input type="text" value={form.playerId} onChange={(e) => setForm({ ...form, playerId: e.target.value })} placeholder="AbCdEfGh" />
              </div>
              <div className="field">
                <label>Library URL</label>
                <input type="url" value={form.libraryUrl} onChange={(e) => setForm({ ...form, libraryUrl: e.target.value })} placeholder="https://cdn.jwplayer.com/libraries/xxx.js" />
              </div>
              <div className="field">
                <label>
                  API Key <span className="req">*</span>
                </label>
                <input type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="xxxxxxxx" />
                <div className="hint">เข้ารหัสด้วย AES-256-GCM ก่อนบันทึกเสมอ</div>
              </div>
              <div className="field">
                <label>API Secret (ถ้ามี)</label>
                <input type="password" value={form.apiSecret} onChange={(e) => setForm({ ...form, apiSecret: e.target.value })} placeholder="xxxxxxxx" />
              </div>
              <div className="field">
                <label>Default Poster Mode</label>
                <select value={form.defaultPosterMode} onChange={(e) => setForm({ ...form, defaultPosterMode: e.target.value })}>
                  <option value="auto">auto</option>
                  <option value="custom">custom</option>
                </select>
              </div>
              <div className="field">
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} style={{ width: "auto" }} />
                  ตั้งเป็น config เริ่มต้น
                </label>
              </div>
              <button className="btn btn-gold btn-block" type="submit" disabled={pending}>
                เพิ่ม Config
              </button>
            </form>
          </div>
        </div>
      )}

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}
