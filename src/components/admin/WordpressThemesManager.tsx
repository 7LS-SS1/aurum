"use client";

import { useState, useTransition } from "react";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { presignAndUploadWordpressThemeAsset } from "@/lib/upload-client";
import type { Role } from "@/lib/permissions";

interface ThemeRow {
  id: string;
  name: string;
  slug: string;
  version: string;
  description: string | null;
  packageUrl: string;
  packageSize: number | null;
  screenshotUrl: string | null;
  changelog: string | null;
  isActive: boolean;
  updatedAt: string;
  createdBy: { name: string | null; email: string } | null;
}

type ThemeStep = "upload" | "details";

function emptyDraft() {
  return {
    id: "",
    name: "",
    slug: "aurum-video",
    version: "1.0.0",
    description: "",
    packageUrl: "",
    packageSize: undefined as number | undefined,
    screenshotUrl: "",
    changelog: "",
    isActive: true,
  };
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function WordpressThemesManager({ initialThemes, role }: { initialThemes: ThemeRow[]; role: Role }) {
  const [themes, setThemes] = useState(initialThemes);
  const [draft, setDraft] = useState(emptyDraft());
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState<ThemeStep>("upload");
  const [toast, setToast] = useState<string | null>(null);
  const [packageProgress, setPackageProgress] = useState(0);
  const [screenshotProgress, setScreenshotProgress] = useState(0);
  const [pending, startTransition] = useTransition();
  const canManage = role === "HEAD";

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  }

  async function reload() {
    const res = await apiFetch<{ themes: ThemeRow[] }>("/api/wp-themes");
    setThemes(res.themes);
  }

  function openCreate() {
    setDraft(emptyDraft());
    setStep("upload");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setDraft(emptyDraft());
    setStep("upload");
    setPackageProgress(0);
    setScreenshotProgress(0);
  }

  async function uploadPackage(file: File | null) {
    if (!file) return;
    try {
      setPackageProgress(1);
      const packageUrl = await presignAndUploadWordpressThemeAsset(file, "package", setPackageProgress);
      setDraft((prev) => ({ ...prev, packageUrl, packageSize: file.size, name: prev.name || file.name.replace(/\.zip$/i, "") }));
      setStep("details");
      notify("อัปโหลดไฟล์ธีมแล้ว");
    } catch (err) {
      notify(err instanceof Error ? err.message : "อัปโหลดไฟล์ธีมไม่สำเร็จ");
    } finally {
      setPackageProgress(0);
    }
  }

  async function uploadScreenshot(file: File | null) {
    if (!file) return;
    try {
      setScreenshotProgress(1);
      const screenshotUrl = await presignAndUploadWordpressThemeAsset(file, "screenshot", setScreenshotProgress);
      setDraft((prev) => ({ ...prev, screenshotUrl }));
      notify("อัปโหลดรูปตัวอย่างแล้ว");
    } catch (err) {
      notify(err instanceof Error ? err.message : "อัปโหลดรูปตัวอย่างไม่สำเร็จ");
    } finally {
      setScreenshotProgress(0);
    }
  }

  function edit(theme: ThemeRow) {
    setDraft({
      id: theme.id,
      name: theme.name,
      slug: theme.slug,
      version: theme.version,
      description: theme.description ?? "",
      packageUrl: theme.packageUrl,
      packageSize: theme.packageSize ?? undefined,
      screenshotUrl: theme.screenshotUrl ?? "",
      changelog: theme.changelog ?? "",
      isActive: theme.isActive,
    });
    setStep("details");
    setModalOpen(true);
  }

  function submit() {
    if (!canManage) return;
    if (!draft.name.trim() || !draft.slug.trim() || !draft.version.trim() || !draft.packageUrl.trim()) {
      notify("กรอกชื่อ slug version และอัปโหลดไฟล์ธีมก่อน");
      return;
    }

    startTransition(async () => {
      try {
        const payload = {
          name: draft.name.trim(),
          slug: slugify(draft.slug),
          version: draft.version.trim(),
          description: draft.description.trim() || undefined,
          packageUrl: draft.packageUrl,
          packageSize: draft.packageSize,
          screenshotUrl: draft.screenshotUrl.trim() || undefined,
          changelog: draft.changelog.trim() || undefined,
          isActive: draft.isActive,
        };
        if (draft.id) {
          await apiFetch(`/api/wp-themes/${draft.id}`, { method: "PATCH", body: JSON.stringify(payload) });
          notify("อัปเดตธีมแล้ว");
        } else {
          await apiFetch("/api/wp-themes", { method: "POST", body: JSON.stringify(payload) });
          notify("เพิ่มธีมแล้ว");
        }
        closeModal();
        await reload();
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "บันทึกธีมไม่สำเร็จ");
      }
    });
  }

  function remove(theme: ThemeRow) {
    if (!canManage || !window.confirm(`ลบธีม ${theme.name} ${theme.version}?`)) return;
    startTransition(async () => {
      try {
        await apiFetch(`/api/wp-themes/${theme.id}`, { method: "DELETE" });
        notify("ลบธีมแล้ว");
        await reload();
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "ลบธีมไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="wp-theme-manager">
      {canManage && (
        <div className="theme-toolbar">
          <div>
            <strong>Theme Library</strong>
            <span>{themes.length} package{themes.length === 1 ? "" : "s"}</span>
          </div>
          <button className="btn btn-gold" onClick={openCreate}>
            เพิ่ม Theme
          </button>
        </div>
      )}

      <div className="theme-list">
        {themes.map((theme) => (
          <article key={theme.id} className="theme-card">
            <div className="theme-shot">
              {theme.screenshotUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- screenshots are uploaded to configured storage
                <img src={theme.screenshotUrl} alt={theme.name} />
              ) : (
                <span>{theme.name.charAt(0)}</span>
              )}
              {theme.isActive && <b>latest</b>}
            </div>
            <div className="theme-card-body">
              <div className="theme-card-head">
                <div>
                  <h3>{theme.name}</h3>
                  <p>
                    {theme.slug} · v{theme.version}
                  </p>
                </div>
                <span className={`badge ${theme.isActive ? "ok" : "neutral"}`}>{theme.isActive ? "ใช้งาน" : "เก็บไว้"}</span>
              </div>
              {theme.description && <p className="hint">{theme.description}</p>}
              <div className="theme-manifest">
                <span>Update manifest</span>
                <code>{`/api/wp-themes/updates/${theme.slug}`}</code>
              </div>
              <div className="theme-actions">
                <a className="btn btn-ghost" href={theme.packageUrl} target="_blank" rel="noreferrer">
                  ดาวน์โหลด
                </a>
                {canManage && (
                  <>
                    <button className="btn btn-ghost" disabled={pending} onClick={() => edit(theme)}>
                      แก้ไข
                    </button>
                    <button className="btn btn-ghost danger-text" disabled={pending} onClick={() => remove(theme)}>
                      ลบ
                    </button>
                  </>
                )}
              </div>
            </div>
          </article>
        ))}
        {themes.length === 0 && <div className="empty">ยังไม่มีธีมในระบบ</div>}
      </div>

      {modalOpen && (
        <div className="theme-modal-backdrop" role="presentation">
          <div className="upload-wizard theme-modal" role="dialog" aria-modal="true" aria-label={draft.id ? "แก้ไข Theme" : "เพิ่ม Theme"}>
            <div className="upload-wizard-head">
              <div>
                <h2>{draft.id ? `แก้ไข ${draft.name}` : draft.name || "เพิ่ม Theme ใหม่"}</h2>
                <p>{draft.packageUrl ? draft.packageUrl : "อัปโหลดไฟล์ธีม .zip ก่อน แล้วกรอกรายละเอียดเวอร์ชัน"}</p>
              </div>
              <button type="button" className="upload-close" onClick={closeModal} aria-label="ปิด">
                x
              </button>
            </div>

            <div className="upload-wizard-steps theme-wizard-steps">
              <div className={`upload-step ${draft.packageUrl ? "done" : "current"}`}>
                <span>{draft.packageUrl ? "OK" : "1"}</span>
                <b>อัปโหลด Theme</b>
              </div>
              <div className={`upload-step ${step === "details" ? "current" : ""}`}>
                <span>2</span>
                <b>รายละเอียด</b>
              </div>
            </div>

            {step === "upload" && (
              <div className="upload-first-panel">
                <label className="youtube-upload-zone theme-dropzone">
                  <input type="file" accept=".zip,application/zip" onChange={(e) => void uploadPackage(e.target.files?.[0] ?? null)} />
                  <span className="upload-cloud">ZIP</span>
                  <strong>ลากไฟล์ธีมมาวาง หรือเลือกไฟล์</strong>
                  <small>รองรับ .zip และอัปโหลดไป R2 โดยตรง</small>
                  <em>เลือกไฟล์ ZIP</em>
                  {packageProgress > 0 && (
                    <div className="upload-wizard-progress">
                      <div style={{ width: `${packageProgress}%` }} />
                      <span>{Math.round(packageProgress)}%</span>
                    </div>
                  )}
                </label>
              </div>
            )}

            {step === "details" && (
              <div className="theme-modal-body">
                <div className="theme-form-grid">
                  <div className="field">
                    <label>ชื่อธีม</label>
                    <input type="text" value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="AURUM Video" />
                  </div>
                  <div className="field">
                    <label>Slug</label>
                    <input type="text" value={draft.slug} onChange={(e) => setDraft((prev) => ({ ...prev, slug: slugify(e.target.value) }))} placeholder="aurum-video" />
                  </div>
                  <div className="field">
                    <label>Version</label>
                    <input type="text" value={draft.version} onChange={(e) => setDraft((prev) => ({ ...prev, version: e.target.value }))} placeholder="1.0.0" />
                  </div>
                  <label className="field">
                    <span className="label-like">เผยแพร่เป็นเวอร์ชันล่าสุด</span>
                    <span className="toggle-line">
                      <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft((prev) => ({ ...prev, isActive: e.target.checked }))} />
                      <span>{draft.isActive ? "ใช้งาน" : "ไม่ใช้งาน"}</span>
                    </span>
                  </label>
                </div>

                <div className="theme-upload-grid">
                  <div className="theme-upload-box">
                    <strong>ไฟล์ธีม .zip</strong>
                    <span>{draft.packageUrl || "ยังไม่มีไฟล์ธีม"}</span>
                    <label className="theme-file-btn">
                      เปลี่ยนไฟล์ ZIP
                      <input type="file" accept=".zip,application/zip" onChange={(e) => void uploadPackage(e.target.files?.[0] ?? null)} />
                    </label>
                    {packageProgress > 0 && <small>{Math.round(packageProgress)}%</small>}
                  </div>
                  <div className="theme-upload-box">
                    <strong>รูปตัวอย่าง</strong>
                    <span>{draft.screenshotUrl || "ยังไม่มีรูปตัวอย่าง"}</span>
                    <label className="theme-file-btn">
                      เลือกรูปตัวอย่าง
                      <input type="file" accept="image/*" onChange={(e) => void uploadScreenshot(e.target.files?.[0] ?? null)} />
                    </label>
                    {screenshotProgress > 0 && <small>{Math.round(screenshotProgress)}%</small>}
                  </div>
                </div>

                <div className="field">
                  <label>คำอธิบาย</label>
                  <textarea value={draft.description} onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))} />
                </div>
                <div className="field">
                  <label>Changelog</label>
                  <textarea value={draft.changelog} onChange={(e) => setDraft((prev) => ({ ...prev, changelog: e.target.value }))} />
                </div>
              </div>
            )}

            <div className="upload-wizard-foot">
              <div className="upload-foot-status">{draft.packageUrl ? "พร้อมบันทึกข้อมูล Theme" : "ต้องอัปโหลดไฟล์ธีมก่อน"}</div>
              <div className="upload-foot-actions">
                {step === "details" && !draft.id && (
                  <button type="button" className="btn btn-ghost" onClick={() => setStep("upload")} disabled={pending}>
                    กลับ
                  </button>
                )}
                <button type="button" className="btn btn-gold" onClick={submit} disabled={pending || !draft.packageUrl}>
                  {draft.id ? "บันทึกการแก้ไข" : "เพิ่ม Theme"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}
