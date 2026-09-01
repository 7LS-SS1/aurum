"use client";

import { useRef, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { resolveUploadContentType, formatUploadError } from "@/lib/upload-queue";

interface ChapterImage {
  id: string;
  imageUrl: string;
  sortOrder: number;
}

interface PresignedResult {
  uploadUrl: string;
  publicUrl: string;
  objectKey: string;
  headers: Record<string, string>;
}

export function ChapterImagesManager({ chapterId, initialImages }: { chapterId: string; initialImages: ChapterImage[] }) {
  const [images, setImages] = useState(initialImages);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      const existingCount = images.length;
      const presignPayload = files.map((file) => ({
        filename: file.name,
        contentType: resolveUploadContentType(file),
        size: file.size,
      }));

      const presigned = await apiFetch<PresignedResult[]>("/api/comic-uploads/presign-batch", {
        method: "POST",
        body: JSON.stringify(presignPayload),
      });

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const target = presigned[i];
        if (!file || !target) continue;
        const res = await fetch(target.uploadUrl, { method: "PUT", body: file, headers: target.headers });
        if (!res.ok) throw new Error(`อัปโหลด ${file.name} ไม่สำเร็จ`);
        setUploadProgress(Math.round(((i + 1) / files.length) * 100));
      }

      const created = await apiFetch<ChapterImage[]>("/api/comic-images", {
        method: "POST",
        body: JSON.stringify({
          chapterId,
          items: presigned.map((p, i) => ({ objectKey: p.objectKey, publicUrl: p.publicUrl, sortOrder: existingCount + i })),
        }),
      });

      setImages((prev) => [...prev, ...created].sort((a, b) => a.sortOrder - b.sortOrder));
      notify(`อัปโหลด ${files.length} รูปภาพแล้ว`);
    } catch (err) {
      notify(formatUploadError(err, "อัปโหลดไม่สำเร็จ"));
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function deleteImage(id: string) {
    if (!confirm("ลบรูปภาพนี้?")) return;
    apiFetch(`/api/comic-images/${id}`, { method: "DELETE" })
      .then(() => {
        setImages((prev) => prev.filter((img) => img.id !== id));
        notify("ลบรูปภาพแล้ว");
      })
      .catch((err) => notify(err instanceof ApiClientError ? err.message : "ลบไม่สำเร็จ"));
  }

  function handleDrop(dropIndex: number) {
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }

    const next = [...images];
    const [moved] = next.splice(dragIndex, 1);
    if (!moved) return;
    next.splice(dropIndex, 0, moved);
    const reordered = next.map((img, i) => ({ ...img, sortOrder: i }));
    setImages(reordered);
    setDragIndex(null);
    setDragOverIndex(null);

    apiFetch("/api/comic-images/reorder", {
      method: "POST",
      body: JSON.stringify({ items: reordered.map((img) => ({ id: img.id, sortOrder: img.sortOrder })) }),
    }).catch((err) => notify(err instanceof ApiClientError ? err.message : "จัดเรียงไม่สำเร็จ"));
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>รูปภาพในตอนนี้ ({images.length})</h3>
      </div>

      <div style={{ padding: "0 12px 16px" }}>
        <label
          className="thumb-picker-row"
          style={{
            cursor: uploading ? "default" : "pointer",
            border: "2px dashed var(--field-line)",
            borderRadius: 10,
            padding: 24,
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <div>
            {uploading ? (
              <>
                <div className="hint">กำลังอัปโหลด... {uploadProgress}%</div>
                <div className="upload-wizard-progress compact" style={{ marginTop: 10 }}>
                  <div style={{ width: `${uploadProgress}%` }} />
                </div>
              </>
            ) : (
              <>
                <div>คลิกหรือเลือกรูปภาพเพื่ออัปโหลด</div>
                <div className="hint">รองรับ JPEG, PNG, WebP, AVIF — เลือกได้หลายไฟล์พร้อมกัน (สูงสุด 60 ไฟล์/ครั้ง)</div>
              </>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              multiple
              onChange={handleUpload}
              disabled={uploading}
              style={{ marginTop: 10 }}
            />
          </div>
        </label>
      </div>

      {images.length === 0 ? (
        <div className="empty">ยังไม่มีรูปภาพ กรุณาอัปโหลดด้านบน</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10, padding: "0 12px 16px" }}>
          {images.map((img, index) => (
            <div
              key={img.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverIndex(index);
              }}
              onDrop={() => handleDrop(index)}
              onDragEnd={() => {
                setDragIndex(null);
                setDragOverIndex(null);
              }}
              style={{
                position: "relative",
                borderRadius: 8,
                overflow: "hidden",
                border: `1px solid ${dragOverIndex === index ? "var(--gold)" : "var(--line)"}`,
                opacity: dragIndex === index ? 0.5 : 1,
                cursor: "grab",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 4,
                  left: 4,
                  zIndex: 2,
                  background: "rgba(0,0,0,0.7)",
                  color: "var(--text)",
                  fontSize: 11,
                  padding: "2px 6px",
                  borderRadius: 6,
                }}
              >
                {index + 1}
              </span>
              <button
                type="button"
                onClick={() => deleteImage(img.id)}
                aria-label={`ลบรูปที่ ${index + 1}`}
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  zIndex: 2,
                  background: "rgba(0,0,0,0.7)",
                  color: "var(--red)",
                  fontSize: 12,
                  padding: "2px 7px",
                  borderRadius: 6,
                }}
              >
                x
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.imageUrl} alt={`หน้า ${index + 1}`} loading="lazy" style={{ width: "100%", aspectRatio: "3 / 4", objectFit: "cover", display: "block" }} />
            </div>
          ))}
        </div>
      )}

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}
