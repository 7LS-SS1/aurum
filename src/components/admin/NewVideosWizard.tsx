"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { presignAndUpload } from "@/lib/upload-client";
import { generateVideoAssets } from "@/lib/browser-video-assets";
import {
  failurePhaseLabel,
  formatUploadError,
  retryActionLabel,
  type UploadFailurePhase,
  validateUploadQueueItem,
} from "@/lib/upload-queue";

interface SiteRow {
  id: string;
  name: string;
  baseUrl: string;
  healthStatus: "OK" | "ERROR" | "UNKNOWN";
}

interface CategoryRow {
  id: string;
  name: string;
}

interface MainCategoryRow {
  id: string;
  name: string;
}

interface ActorRow {
  id: string;
  name: string;
}

interface PopularTag {
  tag: string;
  count: number;
}

type QueueStatus = "queued" | "uploading" | "ready" | "saving" | "done" | "error";
type WizardStage = "category" | "files" | "queue" | "processing" | "complete";

interface QueueItem {
  key: string;
  file: File;
  status: QueueStatus;
  progress: number | null;
  videoUrl: string;
  error?: string;
  errorPhase?: UploadFailurePhase;
  validationError?: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  thumbnailUrl: string;
  thumbnailFile?: File;
  thumbProgress: number | null;
  thumbError?: string;
  previewUrl: string;
  previewFile?: File;
  previewProgress: number | null;
  previewError?: string;
  autoAssetStatus: "idle" | "generating" | "done" | "error";
  autoAssetError?: string;
  categories: string[];
  tags: string[];
  actorIds: string[];
  movieId?: string;
  publishStatus?: string;
}

const MAX_TAGS = 50;

function titleFromFilename(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}

// crypto.randomUUID() is spec'd as secure-context-only — it's undefined (not
// just risky) on a plain-HTTP deployment without TLS, which would otherwise
// throw synchronously inside addFilesToQueue's map() and silently abort the
// whole drop/pick before setQueue ever runs. This fallback works everywhere.
function makeQueueKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `q-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function statusLabel(status: QueueStatus) {
  switch (status) {
    case "queued":
      return "รอคิว";
    case "uploading":
      return "กำลังอัปโหลด";
    case "ready":
      return "พร้อมประมวลผล";
    case "saving":
      return "กำลังบันทึกและเผยแพร่";
    case "done":
      return "เสร็จแล้ว";
    case "error":
      return "ผิดพลาด";
  }
}

export function NewVideosWizard({
  sites,
  categories,
  mainCategories,
  actors,
}: {
  sites: SiteRow[];
  categories: CategoryRow[];
  mainCategories: MainCategoryRow[];
  actors: ActorRow[];
}) {
  const router = useRouter();
  const [stage, setStage] = useState<WizardStage>("category");
  const [toast, setToast] = useState<string | null>(null);

  const [mainCategoryList, setMainCategoryList] = useState(mainCategories);
  const [mainCategory, setMainCategory] = useState("");
  const [showAddMainCategory, setShowAddMainCategory] = useState(false);
  const [newMainCategoryName, setNewMainCategoryName] = useState("");
  const [addingMainCategory, setAddingMainCategory] = useState(false);

  const [categoryList, setCategoryList] = useState(categories);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);

  const [tagInput, setTagInput] = useState("");
  const [popularTags, setPopularTags] = useState<PopularTag[] | null>(null);

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ completed: 0, total: 0 });

  const fileInput = useRef<HTMLInputElement>(null);
  const thumbInput = useRef<HTMLInputElement>(null);
  const previewInput = useRef<HTMLInputElement>(null);

  const current = queue[currentIndex] as QueueItem | undefined;

  useEffect(() => {
    apiFetch<PopularTag[]>("/api/tags/popular")
      .then(setPopularTags)
      .catch(() => setPopularTags([]));
  }, []);

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  function updateItem(key: string, patch: Partial<QueueItem>) {
    setQueue((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  async function startUpload(item: QueueItem): Promise<QueueItem | null> {
    updateItem(item.key, {
      status: "uploading",
      progress: 0,
      error: undefined,
      errorPhase: undefined,
      validationError: undefined,
    });
    try {
      const url = await presignAndUpload(item.file, "bunny", (pct) => updateItem(item.key, { progress: pct }));
      const uploaded = { ...item, status: "ready" as const, progress: null, videoUrl: url, error: undefined, errorPhase: undefined };
      // Patch only upload-owned fields: the user may already be editing this
      // item's title/metadata while a large video is still uploading.
      updateItem(item.key, {
        status: "ready",
        progress: null,
        videoUrl: url,
        error: undefined,
        errorPhase: undefined,
      });
      return uploaded;
    } catch (err) {
      const message = formatUploadError(err, "อัปโหลดวิดีโอหลักไม่สำเร็จ");
      updateItem(item.key, { status: "error", progress: null, error: message, errorPhase: "upload" });
      notify(`${item.file.name}: ${message}`);
      return null;
    }
  }

  // Deliberately not filtered by File.type here — many browsers report an
  // empty type for perfectly valid video files (e.g. .mkv/.ts on Windows,
  // since it comes from the OS's extension-to-MIME mapping, not real content
  // sniffing), which would silently drop the file with zero feedback. Let the
  // presign endpoint's real content-type check (assertUploadAllowedAuto)
  // reject unsupported files instead, visibly, per queue item.
  function addFilesToQueue(files: FileList | File[]) {
    try {
      const incoming = Array.from(files);
      if (!incoming.length) {
        notify("ไม่พบไฟล์ที่เลือก");
        return;
      }

      const newItems: QueueItem[] = incoming.map((file) => ({
        key: makeQueueKey(),
        file,
        status: "queued",
        progress: null,
        videoUrl: "",
        title: titleFromFilename(file.name),
        slug: "",
        excerpt: "",
        content: "",
        thumbnailUrl: "",
        thumbProgress: null,
        previewUrl: "",
        previewProgress: null,
        autoAssetStatus: "idle",
        categories: [],
        tags: [],
        actorIds: [],
      }));

      setQueue((prev) => [...prev, ...newItems]);
      for (const item of newItems) {
        void startUpload(item);
        void generateAssets(item);
      }
    } catch (err) {
      notify(err instanceof Error ? `เพิ่มไฟล์ไม่สำเร็จ: ${err.message}` : "เพิ่มไฟล์ไม่สำเร็จ");
    }
  }

  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.length) addFilesToQueue(e.dataTransfer.files);
  }

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) addFilesToQueue(e.target.files);
    e.target.value = "";
  }

  function removeQueueItem(key: string) {
    setQueue((prev) => prev.filter((item) => item.key !== key));
    setCurrentIndex((idx) => Math.max(0, Math.min(idx, queue.length - 2)));
  }

  function retryUpload(item: QueueItem) {
    void startUpload(item);
  }

  async function addNewCategory() {
    const name = newCategoryName.trim();
    if (!name || !current) return;
    setAddingCategory(true);
    try {
      const category = await apiFetch<CategoryRow>("/api/categories", { method: "POST", body: JSON.stringify({ name }) });
      setCategoryList((prev) => (prev.some((c) => c.name.toLowerCase() === category.name.toLowerCase()) ? prev : [...prev, category].sort((a, b) => a.name.localeCompare(b.name, "th"))));
      updateItem(current.key, { categories: current.categories.includes(category.name) ? current.categories : [...current.categories, category.name] });
      setNewCategoryName("");
      setShowAddCategory(false);
    } catch (err) {
      notify(err instanceof ApiClientError ? err.message : "เพิ่มหมวดหมู่ไม่สำเร็จ");
    } finally {
      setAddingCategory(false);
    }
  }

  async function addNewMainCategory() {
    const name = newMainCategoryName.trim();
    if (!name) return;
    setAddingMainCategory(true);
    try {
      const category = await apiFetch<MainCategoryRow>("/api/main-categories", { method: "POST", body: JSON.stringify({ name }) });
      setMainCategoryList((prev) => (prev.some((c) => c.name.toLowerCase() === category.name.toLowerCase()) ? prev : [...prev, category].sort((a, b) => a.name.localeCompare(b.name, "th"))));
      setMainCategory(category.name);
      setNewMainCategoryName("");
      setShowAddMainCategory(false);
    } catch (err) {
      notify(err instanceof ApiClientError ? err.message : "เพิ่มหมวดหมู่หลักไม่สำเร็จ");
    } finally {
      setAddingMainCategory(false);
    }
  }

  function toggleItemCategory(name: string) {
    if (!current) return;
    const next = current.categories.includes(name) ? current.categories.filter((c) => c !== name) : [...current.categories, name];
    updateItem(current.key, { categories: next });
  }

  function toggleItemActor(id: string) {
    if (!current) return;
    const next = current.actorIds.includes(id) ? current.actorIds.filter((a) => a !== id) : [...current.actorIds, id];
    updateItem(current.key, { actorIds: next });
  }

  function addTag(raw: string) {
    if (!current) return;
    const parts = raw.split(",").map((t) => t.trim()).filter(Boolean);
    if (!parts.length) return;
    let next = current.tags;
    for (const tag of parts) {
      if (next.some((t) => t.toLowerCase() === tag.toLowerCase())) continue;
      if (next.length >= MAX_TAGS) {
        notify(`แท็กครบ ${MAX_TAGS} รายการแล้ว`);
        break;
      }
      next = [...next, tag];
    }
    updateItem(current.key, { tags: next });
  }

  function removeTag(tag: string) {
    if (!current) return;
    updateItem(current.key, { tags: current.tags.filter((t) => t !== tag) });
  }

  async function uploadThumbnail(item: QueueItem, file: File) {
    updateItem(item.key, { thumbnailFile: file, thumbProgress: 0, thumbError: undefined, validationError: undefined });
    try {
      const url = await presignAndUpload(file, "r2", (pct) => updateItem(item.key, { thumbProgress: pct }));
      updateItem(item.key, { thumbnailUrl: url, thumbError: undefined, validationError: undefined });
    } catch (err) {
      const message = formatUploadError(err, "อัปโหลดรูปหน้าปกไม่สำเร็จ");
      updateItem(item.key, { thumbError: message });
      notify(message);
    } finally {
      updateItem(item.key, { thumbProgress: null });
    }
  }

  async function onItemThumbPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !current) return;
    await uploadThumbnail(current, file);
    if (thumbInput.current) thumbInput.current.value = "";
  }

  async function uploadPreview(item: QueueItem, file: File) {
    updateItem(item.key, { previewFile: file, previewProgress: 0, previewError: undefined, validationError: undefined });
    try {
      const url = await presignAndUpload(file, "r2", (pct) => updateItem(item.key, { previewProgress: pct }));
      updateItem(item.key, { previewUrl: url, previewError: undefined, validationError: undefined });
    } catch (err) {
      const message = formatUploadError(err, "อัปโหลดวิดีโอพรีวิวไม่สำเร็จ");
      updateItem(item.key, { previewError: message });
      notify(message);
    } finally {
      updateItem(item.key, { previewProgress: null });
    }
  }

  async function generateAssets(item: QueueItem) {
    updateItem(item.key, { autoAssetStatus: "generating", autoAssetError: undefined });
    try {
      const { thumbnail, preview } = await generateVideoAssets(item.file);
      const [thumbnailUrl, previewUrl] = await Promise.all([
        presignAndUpload(thumbnail, "r2", (pct) => updateItem(item.key, { thumbProgress: pct })),
        presignAndUpload(preview, "r2", (pct) => updateItem(item.key, { previewProgress: pct })),
      ]);
      updateItem(item.key, {
        thumbnailUrl,
        previewUrl,
        thumbnailFile: thumbnail,
        previewFile: preview,
        thumbError: undefined,
        previewError: undefined,
        autoAssetStatus: "done",
        autoAssetError: undefined,
      });
    } catch (err) {
      const message = formatUploadError(err, "สร้างรูปหน้าปกและวิดีโอพรีวิวอัตโนมัติไม่สำเร็จ");
      updateItem(item.key, { autoAssetStatus: "error", autoAssetError: message });
    } finally {
      updateItem(item.key, { thumbProgress: null, previewProgress: null });
    }
  }

  async function onItemPreviewPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !current) return;
    await uploadPreview(current, file);
    if (previewInput.current) previewInput.current.value = "";
  }

  async function persistQueueItem(item: QueueItem): Promise<boolean> {
    let movieId = item.movieId;
    updateItem(item.key, { status: "saving", error: undefined, errorPhase: undefined, validationError: undefined });
    try {
      let movie: { id: string; status?: string };
      if (movieId) {
        movie = await apiFetch<{ id: string; status?: string }>(`/api/movies/${movieId}`);
      } else {
        movie = await apiFetch<{ id: string; status?: string }>("/api/movies", {
          method: "POST",
          body: JSON.stringify({
            title: item.title.trim(),
            slug: item.slug.trim() || undefined,
            excerpt: item.excerpt.trim() || undefined,
            content: item.content.trim() || undefined,
            mainCategory,
            thumbnailUrl: item.thumbnailUrl,
            previewUrl: item.previewUrl.trim() || undefined,
            videoUrl: item.videoUrl,
            videoProvider: "bunny",
            categories: item.categories,
            tags: item.tags,
            actorIds: item.actorIds,
          }),
        });
        movieId = movie.id;
        updateItem(item.key, { movieId });
      }

      // A retry can arrive after the server processed submit-review but the
      // browser lost its response. Only submit DRAFT/REJECTED movies again;
      // every later status proves the first request already moved forward.
      if (!movie.status || movie.status === "DRAFT" || movie.status === "REJECTED") {
        movie = await apiFetch<{ id: string; status?: string }>(`/api/movies/${movieId}/submit-review`, { method: "POST" });
      }

      updateItem(item.key, {
        status: "done",
        movieId,
        publishStatus: movie.status,
        error: undefined,
        errorPhase: undefined,
        validationError: undefined,
      });
      return true;
    } catch (err) {
      const phase: UploadFailurePhase = movieId ? "publish" : "save";
      const message = formatUploadError(err, phase === "publish" ? "เผยแพร่วิดีโอไม่สำเร็จ" : "บันทึกข้อมูลวิดีโอไม่สำเร็จ");
      updateItem(item.key, { status: "error", movieId, error: message, errorPhase: phase });
      return false;
    }
  }

  function validateWholeQueue(): boolean {
    const errors = new Map<string, string>();
    for (const item of queue) {
      if (item.status === "done") continue;
      if (item.autoAssetStatus === "generating") {
        errors.set(item.key, "กำลังสร้างรูปหน้าปกและวิดีโอพรีวิวอัตโนมัติ");
        continue;
      }
      const issues = validateUploadQueueItem(item);
      if (issues.length) errors.set(item.key, issues.join(" • "));
    }

    setQueue((prev) => prev.map((item) => ({ ...item, validationError: errors.get(item.key) })));
    if (!errors.size) return true;

    const firstInvalidIndex = queue.findIndex((item) => errors.has(item.key));
    if (firstInvalidIndex >= 0) setCurrentIndex(firstInvalidIndex);
    notify(`พบข้อมูลที่ต้องแก้ ${errors.size} คลิป — ตรวจรายละเอียดสีแดงในคิว`);
    return false;
  }

  async function processQueueItems(items: QueueItem[]) {
    setSaving(true);
    setBatchProgress({ completed: 0, total: items.length });
    setStage("processing");

    for (let index = 0; index < items.length; index += 1) {
      let item: QueueItem | null = items[index] as QueueItem;
      if (item.errorPhase === "upload" || !item.videoUrl) item = await startUpload(item);
      if (item) await persistQueueItem(item);
      setBatchProgress({ completed: index + 1, total: items.length });
    }

    setSaving(false);
    setStage("complete");
  }

  function processWholeQueue() {
    if (!queue.length || !validateWholeQueue()) return;
    void processQueueItems(queue.filter((item) => item.status !== "done"));
  }

  function retryFailedItem(item: QueueItem) {
    if (item.errorPhase === "validation") {
      const index = queue.findIndex((candidate) => candidate.key === item.key);
      setCurrentIndex(Math.max(0, index));
      setStage("queue");
      return;
    }
    void processQueueItems([item]);
  }

  function retryAllFailed() {
    const retryable = queue.filter((item) => item.status === "error" && item.errorPhase !== "validation");
    if (retryable.length) void processQueueItems(retryable);
  }

  function resetAll() {
    setQueue([]);
    setCurrentIndex(0);
    setMainCategory("");
    setBatchProgress({ completed: 0, total: 0 });
    setStage("category");
  }

  const doneCount = queue.filter((q) => q.status === "done").length;
  const failedCount = queue.filter((q) => q.status === "error").length;

  return (
    <div className="upload-wizard-shell">
      <div className="upload-wizard">
        <div className="upload-wizard-head">
          <div>
            <h2>อัปโหลดวิดีโอใหม่ (หลายคลิป)</h2>
            <p>
              {stage === "category" && "เลือกหมวดหมู่หลักก่อนเริ่มอัปโหลด"}
              {stage === "files" && "ลากไฟล์วิดีโอมาวางได้หลายไฟล์พร้อมกัน"}
              {stage === "queue" && current && `กำลังกรอกรายละเอียดคลิปที่ ${currentIndex + 1}/${queue.length}`}
              {stage === "processing" && `ระบบกำลังประมวลผลทั้งคิว ${batchProgress.completed}/${batchProgress.total}`}
              {stage === "complete" && `สำเร็จ ${doneCount} คลิป${failedCount ? ` • ผิดพลาด ${failedCount} คลิป` : ""}`}
            </p>
          </div>
          <button type="button" className="upload-close" onClick={() => router.push("/admin/videos")} aria-label="ปิด">
            x
          </button>
        </div>

        {stage === "category" && (
          <div className="upload-details-grid single">
            <div className="upload-details-main">
              <div className="field">
                <label>
                  หมวดหมู่หลัก <span className="req">*</span>
                </label>
                <div className="category-grid">
                  {mainCategoryList.map((c) => (
                    <label key={c.id} className="category-option">
                      <input type="radio" name="mainCategory" checked={mainCategory === c.name} onChange={() => setMainCategory(c.name)} />
                      {c.name}
                    </label>
                  ))}
                </div>
                {showAddMainCategory ? (
                  <div className="thumb-picker-row" style={{ marginTop: 10 }}>
                    <input
                      type="text"
                      value={newMainCategoryName}
                      onChange={(e) => setNewMainCategoryName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addNewMainCategory();
                        }
                      }}
                      placeholder="ชื่อหมวดหมู่หลักใหม่"
                      style={{ flex: 1 }}
                    />
                    <button type="button" className="btn btn-gold" disabled={addingMainCategory || !newMainCategoryName.trim()} onClick={addNewMainCategory}>
                      เพิ่ม
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => setShowAddMainCategory(false)}>
                      ยกเลิก
                    </button>
                  </div>
                ) : (
                  <button type="button" className="btn-ghost" style={{ marginTop: 10, padding: "6px 12px", borderRadius: 8, fontSize: 12.5 }} onClick={() => setShowAddMainCategory(true)}>
                    + เพิ่มหมวดหมู่หลักใหม่
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {stage === "files" && (
          <>
            <div className="upload-first-panel">
              <label
                className={`youtube-upload-zone ${dragActive ? "drag-active" : ""}`}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                }}
                onDrop={onDrop}
              >
                <input ref={fileInput} type="file" accept="video/*" multiple onChange={onFileInputChange} />
                <span className="upload-cloud">UP</span>
                <strong>ลากไฟล์วิดีโอมาวาง หรือเลือกไฟล์ (เลือกได้หลายไฟล์)</strong>
                <small>หมวดหมู่หลัก: {mainCategory} — ระบบจะอัปโหลดไป Bunny Stream ทันทีที่เพิ่มเข้าคิว</small>
                <em>เลือกไฟล์</em>
              </label>
            </div>
            {queue.length > 0 && (
              <div className="upload-queue-rail" style={{ paddingBottom: 18 }}>
                {queue.map((item) => (
                  <div key={item.key} className="upload-queue-card">
                    <div className="uq-name">{item.title || item.file.name}</div>
                    <div className={`uq-status ${item.status}`}>
                      {statusLabel(item.status)}
                      {item.status === "uploading" && item.progress !== null ? ` ${Math.round(item.progress)}%` : ""}
                    </div>
                    {item.status === "error" && (
                      <>
                        <div className="upload-item-error">
                          <b>{failurePhaseLabel(item.errorPhase)}</b>
                          <span>{item.error}</span>
                        </div>
                        <button type="button" className="btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => retryUpload(item)}>
                          {retryActionLabel(item.errorPhase)}
                        </button>
                      </>
                    )}
                    <button type="button" className="uq-remove" onClick={() => removeQueueItem(item.key)}>
                      ลบออกจากคิว
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {stage === "queue" && current && (
          <>
            <div className="upload-queue-rail">
              {queue.map((item, idx) => (
                <div
                  key={item.key}
                  className={`upload-queue-card ${idx === currentIndex ? "current" : ""}`}
                  onClick={() => item.status !== "done" && setCurrentIndex(idx)}
                  style={{ cursor: item.status === "done" ? "default" : "pointer" }}
                >
                  <div className="uq-name">{item.title || item.file.name}</div>
                  <div className={`uq-status ${item.status}`}>
                    {statusLabel(item.status)}
                    {item.status === "uploading" && item.progress !== null ? ` ${Math.round(item.progress)}%` : ""}
                  </div>
                  {(item.error || item.validationError) && (
                    <div className="upload-item-error">
                      <b>{failurePhaseLabel(item.validationError ? "validation" : item.errorPhase)}</b>
                      <span>{item.validationError ?? item.error}</span>
                    </div>
                  )}
                  {item.status === "error" && (
                    <button
                      type="button"
                      className="btn-ghost"
                      style={{ fontSize: 11, padding: "3px 8px" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (item.errorPhase === "upload") retryUpload(item);
                        else retryFailedItem(item);
                      }}
                    >
                      {retryActionLabel(item.errorPhase)}
                    </button>
                  )}
                  {item.status !== "done" && item.status !== "saving" && (
                    <button
                      type="button"
                      className="uq-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeQueueItem(item.key);
                      }}
                    >
                      ลบ
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="upload-details-grid">
              <div className="upload-details-main">
                <div className="field">
                  <label>
                    ชื่อเรื่อง <span className="req">*</span>
                  </label>
                  <input type="text" value={current.title} onChange={(e) => updateItem(current.key, { title: e.target.value, validationError: undefined })} placeholder="ใส่ชื่อวิดีโอ" />
                </div>
                <div className="field">
                  <label>Slug (URL)</label>
                  <input type="text" value={current.slug} onChange={(e) => updateItem(current.key, { slug: e.target.value })} placeholder="ปล่อยว่างเพื่อสร้างจากชื่อเรื่องอัตโนมัติ" />
                  <div className="hint">ใช้เป็นส่วนหนึ่งของลิงก์วิดีโอ — ปล่อยว่างไว้ ระบบจะสร้างให้จากชื่อเรื่องเอง</div>
                </div>
                <div className="field">
                  <label>คำอธิบาย</label>
                  <textarea value={current.excerpt} onChange={(e) => updateItem(current.key, { excerpt: e.target.value })} placeholder="ใส่คำอธิบายหรือรายละเอียดสั้น ๆ" />
                </div>
                <div className="field">
                  <label>เนื้อหาเพิ่มเติม</label>
                  <textarea value={current.content} onChange={(e) => updateItem(current.key, { content: e.target.value })} placeholder="รายละเอียดเพิ่มเติมสำหรับ WordPress" />
                </div>

                <div className="field">
                  <label>
                    รูปหน้าปก <span className="req">*</span>
                  </label>
                  {current.autoAssetStatus === "generating" && <p className="asset-generation-note">กำลังสร้างจาก 10%, 50%, 90% ของวิดีโอ</p>}
                  {current.autoAssetStatus === "done" && <p className="asset-generation-note success">สร้างอัตโนมัติจาก 10%, 50%, 90% แล้ว</p>}
                  {current.autoAssetStatus === "error" && (
                    <div className="upload-inline-error">
                      <span>{current.autoAssetError}</span>
                      <button type="button" className="btn-ghost" onClick={() => void generateAssets(current)}>ลองสร้างใหม่</button>
                    </div>
                  )}
                  <div className="thumb-picker-row">
                    {current.thumbnailUrl ? (
                      <div className="thumb-preview-card">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={current.thumbnailUrl} alt="ตัวอย่างรูปหน้าปก" />
                      </div>
                    ) : (
                      <div className="thumb-empty">ยังไม่มีรูปหน้าปก</div>
                    )}
                    <label className="btn btn-ghost">
                      เลือกรูปหน้าปก
                      <input ref={thumbInput} type="file" accept="image/*" onChange={onItemThumbPick} style={{ display: "none" }} />
                    </label>
                  </div>
                  {current.thumbProgress !== null && (
                    <div className="upload-wizard-progress compact">
                      <div style={{ width: `${Math.round(current.thumbProgress)}%` }} />
                      <span>{Math.round(current.thumbProgress)}%</span>
                    </div>
                  )}
                  {current.thumbError && (
                    <div className="upload-inline-error" role="alert">
                      <span>{current.thumbError}</span>
                      {current.thumbnailFile && (
                        <button type="button" className="btn-ghost" onClick={() => uploadThumbnail(current, current.thumbnailFile as File)}>
                          ลองอัปโหลดรูปใหม่
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="field">
                  <label>วิดีโอพรีวิวตอน hover</label>
                  {current.autoAssetStatus === "generating" && <p className="asset-generation-note">กำลังตัด 5 ช่วง: 10%, 30%, 50%, 70%, 90% ช่วงละ 2 วินาที</p>}
                  {current.autoAssetStatus === "done" && <p className="asset-generation-note success">สร้างวิดีโอพรีวิว 10 วินาทีอัตโนมัติแล้ว</p>}
                  <div className="preview-picker-row">
                    {current.previewUrl ? (
                      <video className="preview-clip-card" src={current.previewUrl} muted loop playsInline controls preload="metadata" />
                    ) : (
                      <div className="preview-clip-empty">ยังไม่มีวิดีโอพรีวิว</div>
                    )}
                    <div className="preview-picker-actions">
                      <label className="btn btn-ghost">
                        เลือกไฟล์พรีวิว
                        <input ref={previewInput} type="file" accept="video/*" onChange={onItemPreviewPick} style={{ display: "none" }} />
                      </label>
                      {(current.previewUrl || current.previewError) && (
                        <button type="button" className="btn-ghost" onClick={() => updateItem(current.key, { previewUrl: "", previewFile: undefined, previewError: undefined, validationError: undefined })}>
                          ลบพรีวิว
                        </button>
                      )}
                    </div>
                  </div>
                  {current.previewProgress !== null && (
                    <div className="upload-wizard-progress compact">
                      <div style={{ width: `${Math.round(current.previewProgress)}%` }} />
                      <span>{Math.round(current.previewProgress)}%</span>
                    </div>
                  )}
                  {current.previewError && (
                    <div className="upload-inline-error" role="alert">
                      <span>{current.previewError}</span>
                      {current.previewFile && (
                        <button type="button" className="btn-ghost" onClick={() => uploadPreview(current, current.previewFile as File)}>
                          ลองอัปโหลดพรีวิวใหม่
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="field">
                  <label>หมวดหมู่</label>
                  <div className="category-grid">
                    {categoryList.map((c) => (
                      <label key={c.id} className="category-option">
                        <input type="checkbox" checked={current.categories.includes(c.name)} onChange={() => toggleItemCategory(c.name)} />
                        {c.name}
                      </label>
                    ))}
                  </div>
                  {showAddCategory ? (
                    <div className="thumb-picker-row" style={{ marginTop: 10 }}>
                      <input
                        type="text"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addNewCategory();
                          }
                        }}
                        placeholder="ชื่อหมวดหมู่ใหม่"
                        style={{ flex: 1 }}
                      />
                      <button type="button" className="btn btn-gold" disabled={addingCategory || !newCategoryName.trim()} onClick={addNewCategory}>
                        เพิ่ม
                      </button>
                      <button type="button" className="btn-ghost" onClick={() => setShowAddCategory(false)}>
                        ยกเลิก
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="btn-ghost" style={{ marginTop: 10, padding: "6px 12px", borderRadius: 8, fontSize: 12.5 }} onClick={() => setShowAddCategory(true)}>
                      + เพิ่มหมวดหมู่ใหม่
                    </button>
                  )}
                </div>

                <div className="field">
                  <label>
                    แท็ก <span style={{ color: "var(--muted)", fontWeight: 400 }}>({current.tags.length}/{MAX_TAGS})</span>
                  </label>
                  <div className="tagbox">
                    {current.tags.map((t) => (
                      <span key={t} className="tag">
                        {t}
                        <button type="button" onClick={() => removeTag(t)} aria-label={`ลบแท็ก ${t}`}>
                          x
                        </button>
                      </span>
                    ))}
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== ",") return;
                        e.preventDefault();
                        addTag(tagInput);
                        setTagInput("");
                      }}
                      placeholder="พิมพ์แท็กแล้วกด Enter (ใช้ , คั่นได้หลายแท็ก)"
                    />
                  </div>
                  {popularTags && popularTags.length > 0 && (
                    <div className="chipbar" style={{ padding: "10px 0 0" }}>
                      {popularTags.map(({ tag }) => (
                        <button key={tag} type="button" className={`chip ${current.tags.includes(tag) ? "active" : ""}`} onClick={() => (current.tags.includes(tag) ? removeTag(tag) : addTag(tag))}>
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="field">
                  <label>นักแสดง</label>
                  <div className="category-grid">
                    {actors.map((a) => (
                      <label key={a.id} className="category-option">
                        <input type="checkbox" checked={current.actorIds.includes(a.id)} onChange={() => toggleItemActor(a.id)} />
                        {a.name}
                      </label>
                    ))}
                    {actors.length === 0 && <span style={{ fontSize: 12, color: "var(--muted-2)" }}>ยังไม่มีนักแสดงในระบบ</span>}
                  </div>
                </div>
              </div>

              <aside className="upload-preview-side">
                <div className="video-preview-box">
                  {current.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={current.thumbnailUrl} alt="ตัวอย่างวิดีโอ" />
                  ) : (
                    <span>ระบบจะแสดงรูปหน้าปกที่นี่</span>
                  )}
                </div>
                <div className="upload-copy-field">
                  <span>หมวดหมู่หลัก</span>
                  <b>{mainCategory}</b>
                </div>
                <div className="upload-copy-field">
                  <span>สถานะวิดีโอ</span>
                  <b>{statusLabel(current.status)}</b>
                </div>
                <div className="upload-copy-field">
                  <span>ชื่อไฟล์</span>
                  <b>{current.file.name}</b>
                </div>
                <div className="upload-copy-field">
                  <span>ปลายทาง</span>
                  <b>{sites.length ? "ตามหมวดหมู่หลักที่เลือก (เฉพาะโดเมนที่รับหมวดหมู่นี้)" : "ยังไม่มีโดเมนที่เปิดใช้งาน"}</b>
                </div>
                <div className="upload-copy-field">
                  <span>ความคืบหน้าคิว</span>
                  <b>{doneCount}/{queue.length} คลิปเสร็จแล้ว</b>
                </div>
              </aside>
            </div>
          </>
        )}

        {stage === "processing" && (
          <div className="upload-processing-panel">
            <div className="processing-ring" aria-hidden="true" />
            <h3>กำลังบันทึกและเผยแพร่ทั้งคิว</h3>
            <p>
              ประมวลผลแล้ว {batchProgress.completed}/{batchProgress.total} คลิป — ระบบจะทำรายการถัดไปอัตโนมัติแม้บางคลิปเกิดข้อผิดพลาด
            </p>
            <div className="upload-result-list" aria-live="polite">
              {queue.map((item) => (
                <div key={item.key} className={`upload-result-item ${item.status}`}>
                  <div>
                    <b>{item.title || item.file.name}</b>
                    <span>{statusLabel(item.status)}</span>
                  </div>
                  {item.error && (
                    <div className="upload-item-error">
                      <b>{failurePhaseLabel(item.errorPhase)}</b>
                      <span>{item.error}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {stage === "complete" && (
          <div className="upload-processing-panel">
            <div className={`complete-mark ${failedCount ? "has-errors" : ""}`}>{failedCount ? "!" : "OK"}</div>
            <h3>{failedCount ? "ประมวลผลเสร็จ แต่มีรายการผิดพลาด" : "เสร็จสิ้นทั้งคิว"}</h3>
            <p>
              สำเร็จ {doneCount} คลิป{failedCount ? ` • ไม่สำเร็จ ${failedCount} คลิป` : ""}
            </p>
            <div className="upload-result-list">
              {queue.map((item) => (
                <div key={item.key} className={`upload-result-item ${item.status}`}>
                  <div>
                    <b>{item.title || item.file.name}</b>
                    <span>{item.status === "done" ? `สำเร็จ${item.publishStatus ? ` (${item.publishStatus})` : ""}` : "ไม่สำเร็จ"}</span>
                  </div>
                  {item.status === "error" && (
                    <>
                      <div className="upload-item-error" role="alert">
                        <b>ขั้นตอน: {failurePhaseLabel(item.errorPhase)}</b>
                        <span>{item.error ?? "ไม่ทราบสาเหตุ"}</span>
                      </div>
                      <button className="btn btn-ghost" type="button" disabled={saving} onClick={() => retryFailedItem(item)}>
                        {retryActionLabel(item.errorPhase)}
                      </button>
                    </>
                  )}
                  {item.status === "done" && item.movieId && (
                    <button className="btn-ghost" type="button" onClick={() => router.push(`/admin/videos/${item.movieId}/preview`)}>
                      เปิดตัวอย่าง
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="upload-complete-actions">
              {failedCount > 0 && (
                <button className="btn btn-gold" type="button" disabled={saving} onClick={retryAllFailed}>
                  ลองรายการที่ล้มเหลวทั้งหมด ({failedCount})
                </button>
              )}
              <button className="btn btn-ghost" type="button" onClick={resetAll}>
                อัปโหลดชุดใหม่
              </button>
              <button className="btn btn-gold" type="button" onClick={() => router.push("/admin/videos")}>
                ไปที่รายการวิดีโอ
              </button>
            </div>
          </div>
        )}

        {(stage === "category" || stage === "files" || stage === "queue") && (
          <div className="upload-wizard-foot">
            <div className="upload-foot-status">
              {stage === "category" && (mainCategory ? "พร้อมไปขั้นตอนอัปโหลดไฟล์" : "ต้องเลือกหมวดหมู่หลักก่อน")}
              {stage === "files" && (queue.length ? `เพิ่มแล้ว ${queue.length} คลิป` : "ยังไม่ได้เพิ่มไฟล์วิดีโอ")}
              {stage === "queue" &&
                (currentIndex === queue.length - 1
                  ? `ขั้นสุดท้าย: ระบบจะบันทึกและเผยแพร่ทั้ง ${queue.length} คลิปต่อเนื่องโดยอัตโนมัติ`
                  : `กรอกรายละเอียดคลิปที่ ${currentIndex + 1}/${queue.length} — รายละเอียดจะบันทึกพร้อมกันในขั้นสุดท้าย`)}
            </div>
            <div className="upload-foot-actions">
              {stage === "category" && (
                <button type="button" className="btn btn-gold" disabled={!mainCategory} onClick={() => setStage("files")}>
                  ถัดไป
                </button>
              )}
              {stage === "files" && (
                <>
                  <button type="button" className="btn btn-ghost" onClick={() => setStage("category")} disabled={queue.length > 0}>
                    กลับ
                  </button>
                  <button
                    type="button"
                    className="btn btn-gold"
                    disabled={queue.length === 0}
                    onClick={() => {
                      setCurrentIndex(0);
                      setStage("queue");
                    }}
                  >
                    เริ่มกรอกรายละเอียด
                  </button>
                </>
              )}
              {stage === "queue" && (
                <>
                  <button type="button" className="btn btn-ghost" onClick={() => setStage("files")} disabled={saving}>
                    เพิ่มไฟล์อีก
                  </button>
                  {currentIndex > 0 && (
                    <button type="button" className="btn btn-ghost" onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}>
                      คลิปก่อนหน้า
                    </button>
                  )}
                  {currentIndex < queue.length - 1 ? (
                    <button type="button" className="btn btn-gold" onClick={() => setCurrentIndex((index) => Math.min(queue.length - 1, index + 1))}>
                      รายละเอียดคลิปถัดไป
                    </button>
                  ) : (
                    <button type="button" className="btn btn-gold" onClick={processWholeQueue} disabled={saving || !queue.length}>
                      บันทึกและเผยแพร่ทั้งหมด ({queue.length})
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}
