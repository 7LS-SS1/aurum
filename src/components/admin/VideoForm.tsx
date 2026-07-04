"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { presignAndUpload } from "@/lib/upload-client";

interface SiteRow {
  id: string;
  name: string;
  baseUrl: string;
  healthStatus: "OK" | "ERROR" | "UNKNOWN";
}

interface InitialMovie {
  id: string;
  title: string;
  slug: string | null;
  excerpt: string | null;
  content: string | null;
  mainCategory: string | null;
  categories: unknown;
  tags: unknown;
  thumbnailUrl: string | null;
  previewUrl: string | null;
  iframeUrl: string | null;
  videoUrl: string | null;
  videoProvider: string | null;
  jwPlayerMediaId: string | null;
  extraMeta: unknown;
  status: string;
  rejectionReason: string | null;
}

type WizardStep = "upload" | "details" | "processing" | "complete";

const STEPS: Array<{ key: WizardStep; label: string }> = [
  { key: "upload", label: "อัปโหลดวิดีโอ" },
  { key: "details", label: "รายละเอียด" },
  { key: "processing", label: "ประมวลผล" },
  { key: "complete", label: "เสร็จสิ้น" },
];

function titleFromFilename(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}

export function VideoForm({ sites, initialMovie }: { sites: SiteRow[]; initialMovie?: InitialMovie }) {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(initialMovie?.videoUrl || initialMovie?.jwPlayerMediaId || initialMovie?.iframeUrl ? "details" : "upload");

  const [title, setTitle] = useState(initialMovie?.title ?? "");
  const [excerpt, setExcerpt] = useState(initialMovie?.excerpt ?? "");
  const [content, setContent] = useState(initialMovie?.content ?? "");
  const [thumbnailUrl, setThumbnailUrl] = useState(initialMovie?.thumbnailUrl ?? "");
  const [videoUrl, setVideoUrl] = useState(initialMovie?.videoUrl ?? "");
  const [previewUrl, setPreviewUrl] = useState(initialMovie?.previewUrl ?? "");
  const [sourceFileName, setSourceFileName] = useState("");
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const [thumbProgress, setThumbProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [completedMovieId, setCompletedMovieId] = useState(initialMovie?.id ?? "");

  const videoInput = useRef<HTMLInputElement>(null);
  const thumbInput = useRef<HTMLInputElement>(null);

  const mediaReady = Boolean(videoUrl);
  const detailsReady = Boolean(title.trim() && thumbnailUrl);
  const canStartProcessing = mediaReady && detailsReady;
  const canProcessStatus = !initialMovie || ["DRAFT", "REJECTED"].includes(initialMovie.status);

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  function stepState(current: WizardStep) {
    const currentIndex = STEPS.findIndex((item) => item.key === step);
    const itemIndex = STEPS.findIndex((item) => item.key === current);
    if (itemIndex < currentIndex) return "done";
    if (itemIndex === currentIndex) return "current";
    return "pending";
  }

  async function onVideoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setSourceFileName(file.name);
    if (!title.trim()) setTitle(titleFromFilename(file.name));
    setVideoProgress(0);
    setStep("upload");

    try {
      const url = await presignAndUpload(file, "bunny", setVideoProgress);
      setVideoUrl(url);
      notify("อัปโหลดวิดีโอเสร็จ");
      setStep("details");
    } catch (err) {
      notify(err instanceof Error ? err.message : "อัปโหลดวิดีโอไม่สำเร็จ");
    } finally {
      setVideoProgress(null);
      if (videoInput.current) videoInput.current.value = "";
    }
  }

  async function onThumbPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setThumbProgress(0);
    try {
      const url = await presignAndUpload(file, "r2", setThumbProgress);
      setThumbnailUrl(url);
      notify("อัปโหลดรูปหน้าปกเสร็จ");
    } catch (err) {
      notify(err instanceof Error ? err.message : "อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setThumbProgress(null);
      if (thumbInput.current) thumbInput.current.value = "";
    }
  }

  function validate(): string | null {
    if (!videoUrl) return "กรุณาอัปโหลดวิดีโอก่อน";
    if (!thumbnailUrl) return "กรุณาอัปโหลดรูปหน้าปกก่อน";
    if (!title.trim()) return "กรุณากรอกชื่อเรื่อง";
    return null;
  }

  function buildPayload() {
    return {
      title: title.trim(),
      excerpt: excerpt.trim() || undefined,
      content: content.trim() || undefined,
      thumbnailUrl,
      previewUrl: previewUrl.trim() || undefined,
      videoUrl,
      videoProvider: "bunny",
      targetSiteIds: sites.map((site) => site.id),
    };
  }

  async function persist() {
    const payload = buildPayload();
    if (initialMovie) {
      await apiFetch(`/api/movies/${initialMovie.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      return initialMovie.id;
    }
    const movie = await apiFetch<{ id: string }>("/api/movies", { method: "POST", body: JSON.stringify(payload) });
    return movie.id;
  }

  async function saveOnly() {
    const err = validate();
    if (err) return notify(err);
    setSaving(true);
    try {
      const id = await persist();
      notify(initialMovie ? "บันทึกการแก้ไขแล้ว" : "บันทึกวิดีโอแล้ว");
      router.push(`/admin/videos/${id}/preview`);
    } catch (err) {
      notify(err instanceof ApiClientError ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function startProcessing() {
    const err = validate();
    if (err) return notify(err);

    setSaving(true);
    setStep("processing");
    try {
      const id = await persist();
      setCompletedMovieId(id);
      await apiFetch(`/api/movies/${id}/submit-review`, { method: "POST" });
      notify("ประมวลผลสำเร็จ");
      setStep("complete");
      window.setTimeout(() => router.push(`/admin/videos/${id}/preview`), 650);
    } catch (err) {
      setStep("details");
      notify(err instanceof ApiClientError ? err.message : "ประมวลผลไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="upload-wizard-shell">
      <div className="upload-wizard">
        <div className="upload-wizard-head">
          <div>
            <h2>{title.trim() || "อัปโหลดวิดีโอใหม่"}</h2>
            <p>{sourceFileName || "เลือกไฟล์วิดีโอ แล้วกรอกรายละเอียดที่จำเป็น"}</p>
          </div>
          <button type="button" className="upload-close" onClick={() => router.push("/admin/videos")} aria-label="ปิด">
            x
          </button>
        </div>

        <div className="upload-wizard-steps">
          {STEPS.map((item, index) => {
            const state = stepState(item.key);
            return (
              <div key={item.key} className={`upload-step ${state}`}>
                <span>{state === "done" ? "OK" : index + 1}</span>
                <b>{item.label}</b>
              </div>
            );
          })}
        </div>

        {initialMovie?.status === "REJECTED" && initialMovie.rejectionReason && (
          <div className="warn-banner" style={{ margin: "18px 0 0" }}>
            <span className="wb-icon">!</span>
            <div>
              <strong>ต้องแก้ไขก่อนเริ่มประมวลผลใหม่</strong>
              <span>เหตุผล: {initialMovie.rejectionReason}</span>
            </div>
          </div>
        )}

        {step === "upload" && (
          <div className="upload-first-panel">
            <label className="youtube-upload-zone">
              <input ref={videoInput} type="file" accept="video/*" onChange={onVideoPick} />
              <span className="upload-cloud">UP</span>
              <strong>ลากไฟล์วิดีโอมาวาง หรือเลือกไฟล์</strong>
              <small>ระบบจะอัปโหลดไป Bunny Stream และไม่ผ่านขั้นตอนรอตรวจสอบ</small>
              <em>เลือกไฟล์</em>
            </label>
            {videoProgress !== null && (
              <div className="upload-wizard-progress">
                <div style={{ width: `${Math.round(videoProgress)}%` }} />
                <span>{Math.round(videoProgress)}%</span>
              </div>
            )}
          </div>
        )}

        {step === "details" && (
          <div className="upload-details-grid">
            <div className="upload-details-main">
              <div className="field">
                <label>
                  ชื่อเรื่อง <span className="req">*</span>
                </label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ใส่ชื่อวิดีโอ" />
              </div>
              <div className="field">
                <label>คำอธิบาย</label>
                <textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="ใส่คำอธิบายหรือรายละเอียดสั้น ๆ" />
              </div>
              <div className="field">
                <label>เนื้อหาเพิ่มเติม</label>
                <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="รายละเอียดเพิ่มเติมสำหรับ WordPress" />
              </div>

              <div className="field">
                <label>
                  รูปหน้าปก <span className="req">*</span>
                </label>
                <div className="thumb-picker-row">
                  {thumbnailUrl ? (
                    <div className="thumb-preview-card">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumbnailUrl} alt="ตัวอย่างรูปหน้าปก" />
                    </div>
                  ) : (
                    <div className="thumb-empty">ยังไม่มีรูปหน้าปก</div>
                  )}
                  <label className="btn btn-ghost">
                    เลือกรูปหน้าปก
                    <input ref={thumbInput} type="file" accept="image/*" onChange={onThumbPick} style={{ display: "none" }} />
                  </label>
                </div>
                {thumbProgress !== null && (
                  <div className="upload-wizard-progress compact">
                    <div style={{ width: `${Math.round(thumbProgress)}%` }} />
                    <span>{Math.round(thumbProgress)}%</span>
                  </div>
                )}
              </div>

              <div className="field">
                <label>Preview URL (hover clip)</label>
                <input type="url" value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)} placeholder="https://cdn.example.com/previews/video-preview.mp4" />
              </div>
            </div>

            <aside className="upload-preview-side">
              <div className="video-preview-box">
                {thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbnailUrl} alt="ตัวอย่างวิดีโอ" />
                ) : (
                  <span>ระบบจะแสดงรูปหน้าปกที่นี่</span>
                )}
              </div>
              <div className="upload-copy-field">
                <span>ลิงก์วิดีโอ</span>
                <b>{videoUrl || "กำลังรอวิดีโอ"}</b>
              </div>
              <div className="upload-copy-field">
                <span>ชื่อไฟล์</span>
                <b>{sourceFileName || "ไฟล์ที่อัปโหลดแล้ว"}</b>
              </div>
              <div className="upload-copy-field">
                <span>ปลายทาง</span>
                <b>{sites.length ? `ทุกโดเมนที่เปิดใช้งาน (${sites.length} เว็บ)` : "ยังไม่มีโดเมนที่เปิดใช้งาน"}</b>
              </div>
            </aside>
          </div>
        )}

        {step === "processing" && (
          <div className="upload-processing-panel">
            <div className="processing-ring" />
            <h3>กำลังเผยแพร่วิดีโอ</h3>
            <p>กำลังบันทึกข้อมูลและส่งโพสต์ไปยังทุกเว็บ WordPress ปลายทางทันที</p>
          </div>
        )}

        {step === "complete" && (
          <div className="upload-processing-panel">
            <div className="complete-mark">OK</div>
            <h3>เสร็จสิ้น</h3>
            <p>กำลังพาไปหน้าแสดงวิดีโอตัวอย่าง</p>
            {completedMovieId && (
              <button className="btn btn-gold" type="button" onClick={() => router.push(`/admin/videos/${completedMovieId}/preview`)}>
                เปิดหน้าตัวอย่าง
              </button>
            )}
          </div>
        )}

        <div className="upload-wizard-foot">
          <div className="upload-foot-status">
            {videoProgress !== null
              ? "กำลังอัปโหลดวิดีโอ..."
              : thumbProgress !== null
                ? "กำลังอัปโหลดรูปหน้าปก..."
                : canStartProcessing
                  ? "พร้อมประมวลผล"
                  : "ต้องมีวิดีโอ รูปหน้าปก และชื่อเรื่อง"}
          </div>
          <div className="upload-foot-actions">
            {step === "details" && (
              <>
                <button type="button" className="btn btn-ghost" onClick={() => setStep("upload")} disabled={saving}>
                  กลับ
                </button>
                {canProcessStatus ? (
                  <button type="button" className="btn btn-gold" onClick={startProcessing} disabled={saving || !canStartProcessing}>
                    {saving ? "กำลังประมวลผล..." : "เริ่มประมวลผล"}
                  </button>
                ) : (
                  <button type="button" className="btn btn-gold" onClick={saveOnly} disabled={saving || !canStartProcessing}>
                    {saving ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}
