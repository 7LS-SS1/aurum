"use client";

import { useState, useTransition } from "react";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { presignAndUploadWordpressPlugin } from "@/lib/upload-client";
import type { Role } from "@/lib/permissions";

export interface PluginRow {
  id: string;
  name: string;
  slug: string;
  version: string;
  description: string | null;
  packageUrl: string;
  packageSize: number | null;
  checksumSha256: string;
  requiresWordpress: string | null;
  testedWordpress: string | null;
  requiresPhp: string | null;
  changelog: string | null;
  isActive: boolean;
  updatedAt: string;
  createdBy: { name: string | null; email: string } | null;
}

function freshDraft() {
  return { id: "", name: "AURUM Video Core", slug: "aurum-video-core", version: "", description: "", packageUrl: "", packageSize: 0, checksumSha256: "", requiresWordpress: "6.0", testedWordpress: "6.6", requiresPhp: "8.1", changelog: "", isActive: true };
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function bytes(value: number | null) {
  if (!value) return "—";
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function WordpressPluginsManager({ initialPlugins, role }: { initialPlugins: PluginRow[]; role: Role }) {
  const [plugins, setPlugins] = useState(initialPlugins);
  const [draft, setDraft] = useState(freshDraft());
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const canManage = role === "HEAD";

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  }
  async function reload() {
    setPlugins((await apiFetch<{ plugins: PluginRow[] }>("/api/wp-plugins")).plugins);
  }
  function close() {
    setOpen(false);
    setDraft(freshDraft());
    setProgress(0);
  }
  async function upload(file: File | null) {
    if (!file) return;
    try {
      setProgress(1);
      const [packageUrl, checksumSha256] = await Promise.all([presignAndUploadWordpressPlugin(file, setProgress), sha256(file)]);
      const match = file.name.match(/^(.*?)-([0-9][0-9A-Za-z.+_-]*)\.zip$/i);
      setDraft((current) => ({ ...current, packageUrl, packageSize: file.size, checksumSha256, ...(match ? { slug: slugify(match[1]!), version: match[2]! } : {}) }));
      notify("อัปโหลดและคำนวณ SHA-256 แล้ว");
    } catch (error) {
      notify(error instanceof Error ? error.message : "อัปโหลดปลั๊กอินไม่สำเร็จ");
    } finally {
      setProgress(0);
    }
  }
  function edit(plugin: PluginRow) {
    setDraft({ id: plugin.id, name: plugin.name, slug: plugin.slug, version: plugin.version, description: plugin.description ?? "", packageUrl: plugin.packageUrl, packageSize: plugin.packageSize ?? 0, checksumSha256: plugin.checksumSha256, requiresWordpress: plugin.requiresWordpress ?? "", testedWordpress: plugin.testedWordpress ?? "", requiresPhp: plugin.requiresPhp ?? "", changelog: plugin.changelog ?? "", isActive: plugin.isActive });
    setOpen(true);
  }
  function save() {
    if (!canManage || !draft.name || !draft.slug || !draft.version || !draft.packageUrl || !draft.checksumSha256) return notify("กรอกข้อมูลและอัปโหลด ZIP ให้ครบ");
    startTransition(async () => {
      try {
        const payload = { name: draft.name.trim(), slug: slugify(draft.slug), version: draft.version.trim(), description: draft.description.trim() || undefined, packageUrl: draft.packageUrl, packageSize: draft.packageSize || undefined, checksumSha256: draft.checksumSha256, requiresWordpress: draft.requiresWordpress.trim() || undefined, testedWordpress: draft.testedWordpress.trim() || undefined, requiresPhp: draft.requiresPhp.trim() || undefined, changelog: draft.changelog.trim() || undefined, isActive: draft.isActive };
        await apiFetch(draft.id ? `/api/wp-plugins/${draft.id}` : "/api/wp-plugins", { method: draft.id ? "PATCH" : "POST", body: JSON.stringify(payload) });
        close();
        await reload();
        notify(draft.id ? "อัปเดตปลั๊กอินแล้ว" : "เพิ่มปลั๊กอินแล้ว");
      } catch (error) {
        notify(error instanceof ApiClientError ? error.message : "บันทึกปลั๊กอินไม่สำเร็จ");
      }
    });
  }
  function remove(plugin: PluginRow) {
    if (!canManage || !window.confirm(`ลบ ${plugin.name} ${plugin.version}?`)) return;
    startTransition(async () => {
      try {
        await apiFetch(`/api/wp-plugins/${plugin.id}`, { method: "DELETE" });
        await reload();
        notify("ลบปลั๊กอินแล้ว");
      } catch (error) {
        notify(error instanceof ApiClientError ? error.message : "ลบปลั๊กอินไม่สำเร็จ");
      }
    });
  }

  return <div className="wp-theme-manager wp-plugin-manager">
    {canManage && <div className="theme-toolbar"><div><strong>Plugin Library</strong><span>{plugins.length} releases</span></div><button className="btn btn-gold" onClick={() => { setDraft(freshDraft()); setOpen(true); }}>เพิ่ม Plugin</button></div>}
    <div className="theme-list">
      {plugins.map((plugin) => <article className="theme-card plugin-card" key={plugin.id}>
        <div className="plugin-shot"><span>AC</span>{plugin.isActive && <b>latest</b>}</div>
        <div className="theme-card-body"><div className="theme-card-head"><div><h3>{plugin.name}</h3><p>{plugin.slug} · v{plugin.version}</p></div><span className={`badge ${plugin.isActive ? "ok" : "neutral"}`}>{plugin.isActive ? "พร้อมใช้งาน" : "เก็บไว้"}</span></div>
          {plugin.description && <p className="hint">{plugin.description}</p>}
          <div className="plugin-facts"><span>ZIP <b>{bytes(plugin.packageSize)}</b></span><span>WordPress <b>{plugin.requiresWordpress ? `${plugin.requiresWordpress}+` : "—"}</b></span><span>PHP <b>{plugin.requiresPhp ? `${plugin.requiresPhp}+` : "—"}</b></span></div>
          <div className="theme-manifest"><span>SHA-256</span><code>{plugin.checksumSha256}</code><span>Update manifest</span><code>{`/api/wp-plugins/updates/${plugin.slug}`}</code></div>
          <div className="theme-actions"><a className="btn btn-gold" href={`/api/wp-plugins/${plugin.id}/download`}>ดาวน์โหลด ZIP</a>{canManage && <><button className="btn btn-ghost" disabled={pending} onClick={() => edit(plugin)}>แก้ไข</button><button className="btn btn-ghost danger-text" disabled={pending} onClick={() => remove(plugin)}>ลบ</button></>}</div>
        </div>
      </article>)}
      {!plugins.length && <div className="empty">ยังไม่มี Plugin ในระบบ</div>}
    </div>
    {open && <div className="theme-modal-backdrop" role="presentation"><div className="upload-wizard theme-modal" role="dialog" aria-modal="true" aria-label={draft.id ? "แก้ไข Plugin" : "เพิ่ม Plugin"}>
      <div className="upload-wizard-head"><div><h2>{draft.id ? `แก้ไข ${draft.name}` : "เพิ่ม Plugin ใหม่"}</h2><p>ระบบจะตรวจ root folder, main PHP file, Version header และ SHA-256 ก่อนบันทึก</p></div><button type="button" className="upload-close" onClick={close} aria-label="ปิด">x</button></div>
      <div className="theme-modal-body"><label className="theme-upload-box plugin-upload-box"><strong>ไฟล์ Plugin .zip</strong><span>{draft.packageUrl || "เลือกไฟล์ ZIP ที่มี root aurum-video-core/"}</span><em className="theme-file-btn">เลือกไฟล์ ZIP<input type="file" accept=".zip,application/zip" onChange={(event) => void upload(event.target.files?.[0] ?? null)} /></em>{progress > 0 && <small>{Math.round(progress)}%</small>}</label>
        <div className="theme-form-grid plugin-form-grid"><div className="field"><label>ชื่อ Plugin</label><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div><div className="field"><label>Slug</label><input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: slugify(e.target.value) })} /></div><div className="field"><label>Version</label><input value={draft.version} onChange={(e) => setDraft({ ...draft, version: e.target.value })} /></div><label className="field"><span className="label-like">เวอร์ชันล่าสุด</span><span className="toggle-line"><input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />{draft.isActive ? "ใช้งาน" : "เก็บไว้"}</span></label></div>
        <div className="theme-form-grid plugin-requirements"><div className="field"><label>Requires WordPress</label><input value={draft.requiresWordpress} onChange={(e) => setDraft({ ...draft, requiresWordpress: e.target.value })} /></div><div className="field"><label>Tested WordPress</label><input value={draft.testedWordpress} onChange={(e) => setDraft({ ...draft, testedWordpress: e.target.value })} /></div><div className="field"><label>Requires PHP</label><input value={draft.requiresPhp} onChange={(e) => setDraft({ ...draft, requiresPhp: e.target.value })} /></div></div>
        <div className="field"><label>คำอธิบาย</label><textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div><div className="field"><label>Changelog</label><textarea value={draft.changelog} onChange={(e) => setDraft({ ...draft, changelog: e.target.value })} /></div><div className="theme-manifest"><span>SHA-256</span><code>{draft.checksumSha256 || "จะคำนวณหลังอัปโหลด"}</code></div>
      </div>
      <div className="upload-wizard-foot"><div className="upload-foot-status">{draft.packageUrl ? "พร้อมตรวจสอบและบันทึก" : "ต้องอัปโหลดไฟล์ก่อน"}</div><button className="btn btn-gold" disabled={pending || !draft.packageUrl} onClick={save}>{draft.id ? "บันทึกการแก้ไข" : "เพิ่ม Plugin"}</button></div>
    </div></div>}
    <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
  </div>;
}
