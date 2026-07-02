"use client";

import { useState, useRef } from "react";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { presignAndUpload } from "@/lib/upload-client";
import { DEFAULT_TAXO } from "@/lib/taxonomy";

interface SiteRow {
  id: string;
  name: string;
  baseUrl: string;
  postType: string;
  healthStatus: "OK" | "ERROR" | "UNKNOWN";
}

interface DistributionResult {
  siteId: string;
  site: string;
  status: "success" | "failed";
  postId?: number;
  url?: string;
  error?: string;
}

export function UploadDistribute({ sites }: { sites: SiteRow[] }) {
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [mainCategory, setMainCategory] = useState(Object.keys(DEFAULT_TAXO)[0] ?? "");
  const [subCategory, setSubCategory] = useState(DEFAULT_TAXO[Object.keys(DEFAULT_TAXO)[0] ?? ""]?.[0] ?? "");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [thumbProgress, setThumbProgress] = useState<number | null>(null);

  const [videoMode, setVideoMode] = useState<"link" | "upload">("link");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoProgress, setVideoProgress] = useState<number | null>(null);

  const [selectedSites, setSelectedSites] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<{ total: number; success: number; results: DistributionResult[] } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const thumbInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  function toggleSite(id: string) {
    setSelectedSites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addTag(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const v = tagInput.trim().replace(/,$/, "");
      if (v && !tags.includes(v)) setTags((prev) => [...prev, v]);
      setTagInput("");
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
    }
  }

  async function onVideoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoProgress(0);
    try {
      const url = await presignAndUpload(file, "bunny", setVideoProgress);
      setVideoUrl(url);
      notify("อัปโหลดวิดีโอเสร็จ ✓");
    } catch (err) {
      notify(err instanceof Error ? err.message : "อัปโหลดวิดีโอไม่สำเร็จ");
    } finally {
      setVideoProgress(null);
    }
  }

  async function distribute() {
    if (!title.trim()) return notify("กรุณากรอกชื่อเรื่อง");
    if (!mainCategory) return notify("กรุณาเลือกหมวดหมู่หลัก");
    if (!videoUrl) return notify(videoMode === "upload" ? "กรุณาอัปโหลดวิดีโอให้เสร็จก่อน" : "กรุณาใส่ลิงก์วิดีโอ");
    if (!selectedSites.size) return notify("เลือกเว็บปลายทางอย่างน้อย 1 เว็บ");
    if (!window.confirm(`เผยแพร่ "${title.trim()}" ไปยัง ${selectedSites.size} เว็บทันที โดยไม่ผ่านการตรวจสอบ — ยืนยัน?`)) return;

    setSubmitting(true);
    setResults(null);
    try {
      const movie = await apiFetch<{ id: string }>("/api/movies", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          excerpt: excerpt.trim() || undefined,
          mainCategory,
          categories: subCategory ? [subCategory] : [],
          tags,
          thumbnailUrl: thumbnailUrl || undefined,
          videoUrl,
          videoProvider: videoMode === "upload" ? "bunny" : "external",
        }),
      });

      const dist = await apiFetch<{ summary: { total: number; success: number }; results: DistributionResult[] }>(
        `/api/movies/${movie.id}/distribute`,
        { method: "POST", body: JSON.stringify({ siteIds: [...selectedSites] }) },
      );

      setResults({ total: dist.summary.total, success: dist.summary.success, results: dist.results });
      notify(dist.summary.success === dist.summary.total ? "กระจายสำเร็จทุกเว็บ ✓" : `สำเร็จ ${dist.summary.success}/${dist.summary.total} เว็บ`);
    } catch (err) {
      notify(err instanceof ApiClientError ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="warn-banner">
        <span className="wb-icon">⚡</span>
        <div>
          <strong>โหมดอัปโหลดด่วน — เผยแพร่ทันที</strong>
          <span>บันทึกแล้วจะกระจายไปเว็บปลายทางที่เลือกทันที โดยข้ามขั้นตอนตรวจสอบ/อนุมัติทั้งหมด ใช้เมื่อมั่นใจในเนื้อหาแล้วเท่านั้น — ถ้าต้องการให้ทีมตรวจสอบก่อน ใช้หน้า &quot;เพิ่มวิดีโอใหม่&quot; แทน</span>
        </div>
      </div>

      <div className="ad-grid">
        <div>
          <div className="panel">
            <div className="panel-head">
              <span className="n">1</span>
              <h3>ข้อมูลเนื้อหา</h3>
            </div>
            <div className="field">
              <label>
                ชื่อเรื่อง <span className="req">*</span>
              </label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น ราตรีสีทอง" />
            </div>
            <div className="field">
              <label>เรื่องย่อ</label>
              <textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="เรื่องราวของ..." />
            </div>
            <div className="row2">
              <div className="field">
                <label>
                  หมวดหมู่หลัก <span className="req">*</span>
                </label>
                <select
                  value={mainCategory}
                  onChange={(e) => {
                    setMainCategory(e.target.value);
                    setSubCategory(DEFAULT_TAXO[e.target.value]?.[0] ?? "");
                  }}
                >
                  {Object.keys(DEFAULT_TAXO).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>หมวดหมู่ย่อย</label>
                <select value={subCategory} onChange={(e) => setSubCategory(e.target.value)}>
                  {(DEFAULT_TAXO[mainCategory] ?? []).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label>แท็ก</label>
              <div className="tagbox">
                {tags.map((t, i) => (
                  <span key={t} className="tag">
                    <b>{t}</b>
                    <button type="button" onClick={() => setTags((prev) => prev.filter((_, idx) => idx !== i))}>
                      ×
                    </button>
                  </span>
                ))}
                <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={addTag} placeholder="พิมพ์แล้วกด Enter" />
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <span className="n">2</span>
              <h3>สื่อ</h3>
            </div>
            <div className="field">
              <label>รูปหน้าปก (อัปขึ้น Cloudflare R2)</label>
              {thumbnailUrl ? (
                <div className="upload-preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbnailUrl} alt="ตัวอย่างรูปหน้าปก" />
                  <div className="up-info">
                    <b>อัปโหลดแล้ว ✓</b>
                    {thumbnailUrl}
                  </div>
                  <button type="button" className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5, flex: "none" }} onClick={() => setThumbnailUrl("")}>
                    เปลี่ยนรูป
                  </button>
                </div>
              ) : (
                <label className="upload-zone">
                  <input ref={thumbInput} type="file" accept="image/*" onChange={onThumbPick} />
                  <div className="uz-icon">🖼️</div>
                  <div className="uz-text">คลิกหรือลากไฟล์รูปมาวาง</div>
                  <div className="uz-hint">JPG · PNG · WEBP · AVIF, สูงสุด 15MB</div>
                </label>
              )}
              {thumbProgress !== null && (
                <div className="upload-progress-track">
                  <div className="upload-progress-fill" style={{ width: `${Math.round(thumbProgress)}%` }} />
                </div>
              )}
            </div>

            <div className="field">
              <label>วิดีโอ</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <button type="button" className={videoMode === "link" ? "btn btn-gold" : "btn btn-ghost"} onClick={() => setVideoMode("link")}>
                  วางลิงก์
                </button>
                <button type="button" className={videoMode === "upload" ? "btn btn-gold" : "btn btn-ghost"} onClick={() => setVideoMode("upload")}>
                  อัปโหลดไฟล์ (Bunny Stream)
                </button>
              </div>
              {videoMode === "link" ? (
                <input type="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://stream.bunny.net/.../play.m3u8" />
              ) : videoUrl ? (
                <div className="upload-preview">
                  <div style={{ width: 56, height: 56, borderRadius: 8, background: "var(--bg)", display: "grid", placeItems: "center", fontSize: 22, flex: "none" }}>🎬</div>
                  <div className="up-info">
                    <b>อัปโหลดแล้ว ✓</b>
                    {videoUrl}
                  </div>
                  <button type="button" className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5, flex: "none" }} onClick={() => setVideoUrl("")}>
                    เปลี่ยนไฟล์
                  </button>
                </div>
              ) : (
                <label className="upload-zone">
                  <input ref={videoInput} type="file" accept="video/*" onChange={onVideoPick} />
                  <div className="uz-icon">🎬</div>
                  <div className="uz-text">คลิกหรือลากไฟล์วิดีโอมาวาง</div>
                  <div className="uz-hint">MP4 · MOV · MKV · WEBM, สูงสุด 8GB — เข้ารหัส HLS ผ่าน Bunny Stream</div>
                </label>
              )}
              {videoMode === "upload" && videoProgress !== null && (
                <div className="upload-progress-track">
                  <div className="upload-progress-fill" style={{ width: `${Math.round(videoProgress)}%` }} />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rail">
          <div className="panel">
            <div className="panel-head">
              <span className="n">3</span>
              <h3>เว็บปลายทาง</h3>
            </div>
            <div className="sel-bar">
              <span>
                <b style={{ color: "var(--text)" }}>{selectedSites.size}</b> / {sites.length} เว็บ
              </span>
              <a
                onClick={() =>
                  setSelectedSites(selectedSites.size === sites.length ? new Set() : new Set(sites.map((s) => s.id)))
                }
              >
                เลือกทั้งหมด
              </a>
            </div>
            {sites.length === 0 && <div className="empty">ยังไม่มีเว็บปลายทาง — เพิ่มได้ที่หน้า &quot;เว็บปลายทาง&quot;</div>}
            {sites.map((s) => (
              <div key={s.id} className={`site-row ${selectedSites.has(s.id) ? "sel" : ""}`} onClick={() => toggleSite(s.id)}>
                <span className="cbox" />
                <div className="site-info">
                  <div className="nm">
                    {s.name} <span className={`health ${s.healthStatus}`} />
                  </div>
                  <div className="url">{s.baseUrl}</div>
                </div>
              </div>
            ))}
          </div>

          <button className="btn btn-gold btn-block" style={{ fontSize: 15, padding: 14 }} onClick={distribute} disabled={submitting}>
            {submitting ? "กำลังกระจาย…" : "⚡ เผยแพร่ทันที"}
          </button>
        </div>
      </div>

      {results && (
        <div className="panel">
          <div className="panel-head">
            <span className="n">✓</span>
            <h3>ผลการกระจาย</h3>
          </div>
          <div className="result-summary">
            <div>
              <div className="big">
                {results.success}/{results.total}
              </div>
              <div className="lbl">เว็บที่สร้างโพสต์สำเร็จ</div>
            </div>
          </div>
          {results.results.map((r) => (
            <div className="res-row" key={r.siteId}>
              <span className={`st ${r.status}`} />
              <div className="rinfo">
                <div className="rname">{r.site}</div>
                <div className={`rmsg ${r.status === "failed" ? "err" : ""}`}>
                  {r.status === "success" ? (
                    <>
                      โพสต์ #{r.postId} →{" "}
                      <a href={r.url} target="_blank" rel="noreferrer">
                        {r.url}
                      </a>
                    </>
                  ) : (
                    r.error
                  )}
                </div>
              </div>
              <span className={`stat-txt ${r.status}`}>{r.status === "success" ? "สำเร็จ" : "ล้มเหลว"}</span>
            </div>
          ))}
        </div>
      )}

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}
