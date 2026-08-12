"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { presignAndUpload } from "@/lib/upload-client";

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

interface PopularTag {
  tag: string;
  count: number;
}

type QueueStatus = "queued" | "uploading" | "ready" | "saving" | "done" | "error";
type WizardStage = "category" | "files" | "queue" | "complete";

interface QueueItem {
  key: string;
  file: File;
  status: QueueStatus;
  progress: number | null;
  videoUrl: string;
  error?: string;
  title: string;
  excerpt: string;
  content: string;
  thumbnailUrl: string;
  thumbProgress: number | null;
  previewUrl: string;
  previewProgress: number | null;
  categories: string[];
  tags: string[];
  movieId?: string;
}

const MAX_TAGS = 50;

function titleFromFilename(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}

function statusLabel(status: QueueStatus) {
  switch (status) {
    case "queued":
      return "รอคิว";
    case "uploading":
      return "กำลังอัปโหลด";
    case "ready":
      return "พร้อมกรอกรายละเอียด";
    case "saving":
      return "กำลังบันทึก";
    case "done":
      return "เสร็จแล้ว";
    case "error":
      return "ผิดพลาด";
  }
}

export function NewVideosWizard({ sites, categories, mainCategories }: { sites: SiteRow[]; categories: CategoryRow[]; mainCategories: MainCategoryRow[] }) {
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

  async function startUpload(key: string, file: File) {
    updateItem(key, { status: "uploading", progress: 0, error: undefined });
    try {
      const url = await presignAndUpload(file, "bunny", (pct) => updateItem(key, { progress: pct }));
      updateItem(key, { status: "ready", progress: null, videoUrl: url });
    } catch (err) {
      updateItem(key, { status: "error", progress: null, error: err instanceof Error ? err.message : "อัปโหลดวิดีโอไม่สำเร็จ" });
    }
  }

  function addFilesToQueue(files: FileList | File[]) {
    const videoFiles = Array.from(files).filter((f) => f.type.startsWith("video/"));
    if (!videoFiles.length) return;

    const newItems: QueueItem[] = videoFiles.map((file) => ({
      key: crypto.randomUUID(),
      file,
      status: "queued",
      progress: null,
      videoUrl: "",
      title: titleFromFilename(file.name),
      excerpt: "",
      content: "",
      thumbnailUrl: "",
      thumbProgress: null,
      previewUrl: "",
      previewProgress: null,
      categories: [],
      tags: [],
    }));

    setQueue((prev) => [...prev, ...newItems]);
    for (const item of newItems) void startUpload(item.key, item.file);
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
    void startUpload(item.key, item.file);
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

  async function onItemThumbPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !current) return;
    const key = current.key;
    updateItem(key, { thumbProgress: 0 });
    try {
      const url = await presignAndUpload(file, "r2", (pct) => updateItem(key, { thumbProgress: pct }));
      updateItem(key, { thumbnailUrl: url });
    } catch (err) {
      notify(err instanceof Error ? err.message : "อัปโหลดรูปไม่สำเร็จ");
    } finally {
      updateItem(key, { thumbProgress: null });
      if (thumbInput.current) thumbInput.current.value = "";
    }
  }

  async function onItemPreviewPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !current) return;
    const key = current.key;
    updateItem(key, { previewProgress: 0 });
    try {
      const url = await presignAndUpload(file, "r2", (pct) => updateItem(key, { previewProgress: pct }));
      updateItem(key, { previewUrl: url });
    } catch (err) {
      notify(err instanceof Error ? err.message : "อัปโหลดวิดีโอพรีวิวไม่สำเร็จ");
    } finally {
      updateItem(key, { previewProgress: null });
      if (previewInput.current) previewInput.current.value = "";
    }
  }

  function validateCurrent(): string | null {
    if (!current) return "ไม่มีคลิปในคิว";
    if (current.status !== "ready" && current.status !== "error") return "กรุณารอวิดีโออัปโหลดให้เสร็จก่อน";
    if (!current.videoUrl) return "วิดีโอยังอัปโหลดไม่สำเร็จ";
    if (!current.title.trim()) return "กรุณากรอกชื่อเรื่อง";
    if (!current.thumbnailUrl) return "กรุณาอัปโหลดรูปหน้าปกก่อน";
    return null;
  }

  function nextPendingIndex(afterKey: string): number {
    const idx = queue.findIndex((item) => item.status !== "done" && item.key !== afterKey);
    return idx;
  }

  async function saveCurrentAndAdvance() {
    if (!current) return;
    const err = validateCurrent();
    if (err) return notify(err);

    const item = current;
    updateItem(item.key, { status: "saving" });
    setSaving(true);
    try {
      const movie = await apiFetch<{ id: string }>("/api/movies", {
        method: "POST",
        body: JSON.stringify({
          title: item.title.trim(),
          excerpt: item.excerpt.trim() || undefined,
          content: item.content.trim() || undefined,
          mainCategory,
          thumbnailUrl: item.thumbnailUrl,
          previewUrl: item.previewUrl.trim() || undefined,
          videoUrl: item.videoUrl,
          videoProvider: "bunny",
          categories: item.categories,
          tags: item.tags,
        }),
      });
      await apiFetch(`/api/movies/${movie.id}/submit-review`, { method: "POST" });
      updateItem(item.key, { status: "done", movieId: movie.id });
      notify(`บันทึก "${item.title}" แล้ว`);

      const remaining = queue.filter((q) => q.key !== item.key && q.status !== "done");
      if (remaining.length === 0) {
        setStage("complete");
      } else {
        const nextIdx = nextPendingIndex(item.key);
        setCurrentIndex(nextIdx === -1 ? 0 : nextIdx);
      }
    } catch (err) {
      updateItem(item.key, { status: "ready" });
      notify(err instanceof ApiClientError ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  function resetAll() {
    setQueue([]);
    setCurrentIndex(0);
    setMainCategory("");
    setStage("category");
  }

  const doneCount = queue.filter((q) => q.status === "done").length;

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
              {stage === "complete" && `เสร็จสิ้น ${doneCount} คลิป`}
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
                      <button type="button" className="btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => retryUpload(item)}>
                        ลองใหม่
                      </button>
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
                  <input type="text" value={current.title} onChange={(e) => updateItem(current.key, { title: e.target.value })} placeholder="ใส่ชื่อวิดีโอ" />
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
                </div>

                <div className="field">
                  <label>วิดีโอพรีวิวตอน hover</label>
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
                      {current.previewUrl && (
                        <button type="button" className="btn-ghost" onClick={() => updateItem(current.key, { previewUrl: "" })}>
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

        {stage === "complete" && (
          <div className="upload-processing-panel">
            <div className="complete-mark">OK</div>
            <h3>เสร็จสิ้นทั้งคิว</h3>
            <p>บันทึกวิดีโอสำเร็จ {doneCount} คลิป</p>
            <div style={{ display: "grid", gap: 8, width: "min(480px, 100%)", textAlign: "left" }}>
              {queue.map((item) => (
                <div key={item.key} className="upload-copy-field">
                  <span>{item.title}</span>
                  {item.movieId ? (
                    <button className="btn-ghost" type="button" onClick={() => router.push(`/admin/videos/${item.movieId}/preview`)}>
                      เปิดตัวอย่าง
                    </button>
                  ) : (
                    <b>ไม่สำเร็จ</b>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
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
              {stage === "queue" && (saving ? "กำลังบันทึก..." : "กรอกรายละเอียดให้ครบก่อนบันทึก")}
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
                      const idx = nextPendingIndex("");
                      setCurrentIndex(idx === -1 ? 0 : idx);
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
                  <button type="button" className="btn btn-gold" onClick={saveCurrentAndAdvance} disabled={saving || !current || current.status === "saving"}>
                    {saving ? "กำลังบันทึก..." : "บันทึกคลิปนี้ + ถัดไป"}
                  </button>
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
