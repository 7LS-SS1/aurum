"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { presignAndUpload } from "@/lib/upload-client";
import { DEFAULT_TAXO } from "@/lib/taxonomy";
import { WorkflowSteps } from "@/components/admin/WorkflowSteps";

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
  targetSiteIds: unknown;
  status: string;
  rejectionReason: string | null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export function VideoForm({ sites, initialMovie }: { sites: SiteRow[]; initialMovie?: InitialMovie }) {
  const router = useRouter();
  const extraMeta = (initialMovie?.extraMeta as Record<string, unknown>) ?? {};

  const [title, setTitle] = useState(initialMovie?.title ?? "");
  const [slug, setSlug] = useState(initialMovie?.slug ?? "");
  const [excerpt, setExcerpt] = useState(initialMovie?.excerpt ?? "");
  const [content, setContent] = useState(initialMovie?.content ?? "");
  const [mainCategory, setMainCategory] = useState(initialMovie?.mainCategory ?? Object.keys(DEFAULT_TAXO)[0] ?? "");
  const [categories, setCategories] = useState<string[]>(asStringArray(initialMovie?.categories));
  const [categoryInput, setCategoryInput] = useState("");
  const [tags, setTags] = useState<string[]>(asStringArray(initialMovie?.tags));
  const [tagInput, setTagInput] = useState("");

  const [thumbnailUrl, setThumbnailUrl] = useState(initialMovie?.thumbnailUrl ?? "");
  const [previewUrl, setPreviewUrl] = useState(initialMovie?.previewUrl ?? "");
  const [iframeUrl, setIframeUrl] = useState(initialMovie?.iframeUrl ?? "");
  const [thumbProgress, setThumbProgress] = useState<number | null>(null);

  const initialVideoMode: "link" | "upload" | "jwplayer" = initialMovie?.jwPlayerMediaId
    ? "jwplayer"
    : initialMovie?.videoProvider === "bunny"
      ? "upload"
      : initialMovie?.videoUrl
        ? "link"
        : "jwplayer";
  const [videoMode, setVideoMode] = useState<"link" | "upload" | "jwplayer">(initialVideoMode);
  const [videoUrl, setVideoUrl] = useState(initialMovie?.videoUrl ?? "");
  const [jwPlayerMediaId, setJwPlayerMediaId] = useState(initialMovie?.jwPlayerMediaId ?? "");
  const [videoProgress, setVideoProgress] = useState<number | null>(null);

  const [jwR2Progress, setJwR2Progress] = useState<number | null>(null);
  const [jwIngesting, setJwIngesting] = useState(false);
  const [jwIngestStatus, setJwIngestStatus] = useState<string | null>((extraMeta.jwIngestStatus as string) ?? null);
  const jwVideoInput = useRef<HTMLInputElement>(null);

  const [quality, setQuality] = useState((extraMeta.quality as string) ?? "");
  const [duration, setDuration] = useState((extraMeta.duration as string) ?? "");

  const [selectedSites, setSelectedSites] = useState<Set<string>>(new Set(asStringArray(initialMovie?.targetSiteIds)));
  const [saving, setSaving] = useState(false);
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

  function addToList(input: string, setInput: (v: string) => void, list: string[], setList: (v: string[]) => void) {
    const v = input.trim().replace(/,$/, "");
    if (v && !list.includes(v)) setList([...list, v]);
    setInput("");
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

  /**
   * Automated JWPlayer ingest: upload the source file to R2 first (direct
   * browser -> R2, bytes never touch this server), then hand the resulting
   * R2 URL to JWX's fetch-upload ingest so JWPlayer downloads it server-side.
   */
  async function onJwVideoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setJwR2Progress(0);
    setJwIngestStatus(null);
    try {
      const r2Url = await presignAndUpload(file, "r2", setJwR2Progress);
      setVideoUrl(r2Url);
      setJwR2Progress(null);
      setJwIngesting(true);
      const ingest = await apiFetch<{ jwPlayerMediaId: string; iframeUrl?: string; sourceUrl: string; status: string }>(
        "/api/uploads/jwplayer-ingest",
        {
          method: "POST",
          body: JSON.stringify({ sourceUrl: r2Url, filename: file.name, title: title.trim() || file.name, contentType: file.type }),
        },
      );
      setJwPlayerMediaId(ingest.jwPlayerMediaId);
      if (ingest.iframeUrl) setIframeUrl(ingest.iframeUrl);
      setJwIngestStatus(ingest.status);
      notify("ส่งวิดีโอเข้า JWPlayer แล้ว ✓");
    } catch (err) {
      notify(err instanceof ApiClientError ? err.message : err instanceof Error ? err.message : "อัปโหลด/ส่งเข้า JWPlayer ไม่สำเร็จ");
    } finally {
      setJwR2Progress(null);
      setJwIngesting(false);
    }
  }

  function buildPayload() {
    return {
      title: title.trim(),
      slug: slug.trim() || undefined,
      excerpt: excerpt.trim() || undefined,
      content: content.trim() || undefined,
      mainCategory: mainCategory || undefined,
      categories,
      tags,
      thumbnailUrl: thumbnailUrl || undefined,
      previewUrl: previewUrl || undefined,
      iframeUrl: iframeUrl || undefined,
      // videoUrl doubles as the R2 source URL when a file was uploaded via the
      // JWPlayer auto-ingest flow — kept for reference/fallback even though
      // playback uses the JWPlayer iframe, not this URL directly.
      videoUrl: videoUrl || undefined,
      videoProvider: videoMode === "jwplayer" ? "jwplayer" : videoMode === "upload" ? "bunny" : "external",
      jwPlayerMediaId: videoMode === "jwplayer" ? jwPlayerMediaId.trim() || undefined : undefined,
      extraMeta: { ...extraMeta, quality: quality || undefined, duration: duration || undefined, jwIngestStatus: jwIngestStatus || undefined },
      targetSiteIds: [...selectedSites],
    };
  }

  function validate(): string | null {
    if (!title.trim()) return "กรุณากรอกชื่อเรื่อง";
    if (!mainCategory) return "กรุณาเลือกหมวดหมู่หลัก";
    return null;
  }

  const status = initialMovie?.status ?? "DRAFT";
  const canSubmitForReview = !initialMovie || status === "DRAFT" || status === "REJECTED";

  async function persist(): Promise<string> {
    const payload = buildPayload();
    if (initialMovie) {
      await apiFetch(`/api/movies/${initialMovie.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      return initialMovie.id;
    }
    const movie = await apiFetch<{ id: string }>("/api/movies", { method: "POST", body: JSON.stringify(payload) });
    return movie.id;
  }

  async function handleSaveDraft() {
    const err = validate();
    if (err) return notify(err);
    setSaving(true);
    try {
      const id = await persist();
      notify(canSubmitForReview ? "บันทึกร่างแล้ว" : "บันทึกการแก้ไขแล้ว");
      router.push(`/admin/videos/${id}/edit`);
      router.refresh();
    } catch (e) {
      notify(e instanceof ApiClientError ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitReview() {
    const err = validate();
    if (err) return notify(err);
    setSaving(true);
    try {
      const id = await persist();
      await apiFetch(`/api/movies/${id}/submit-review`, { method: "POST" });
      notify("ส่งตรวจสอบแล้ว");
      router.push("/admin/videos");
    } catch (e) {
      notify(e instanceof ApiClientError ? e.message : "ส่งตรวจสอบไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <WorkflowSteps status={status} />

      {initialMovie && initialMovie.status === "REJECTED" && initialMovie.rejectionReason && (
        <div className="warn-banner">
          <span className="wb-icon">⚠</span>
          <div>
            <strong>ถูกตีกลับ — ต้องแก้ไขก่อนส่งตรวจใหม่</strong>
            <span>เหตุผล: {initialMovie.rejectionReason}</span>
          </div>
        </div>
      )}

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
              <label>Slug</label>
              <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="ratri-see-thong" />
            </div>
            <div className="field">
              <label>เรื่องย่อ</label>
              <textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="เรื่องราวของ..." />
            </div>
            <div className="field">
              <label>เนื้อหาเต็ม</label>
              <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="รายละเอียดเพิ่มเติม..." />
            </div>
            <div className="row2">
              <div className="field">
                <label>
                  หมวดหมู่หลัก <span className="req">*</span>
                </label>
                <select value={mainCategory} onChange={(e) => setMainCategory(e.target.value)}>
                  {Object.keys(DEFAULT_TAXO).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>คุณภาพ (quality)</label>
                <input type="text" value={quality} onChange={(e) => setQuality(e.target.value)} placeholder="1080p" />
              </div>
            </div>
            <div className="field">
              <label>หมวดหมู่ย่อย</label>
              <div className="tagbox">
                {categories.map((c, i) => (
                  <span key={c} className="tag">
                    <b>{c}</b>
                    <button type="button" onClick={() => setCategories(categories.filter((_, idx) => idx !== i))}>
                      ×
                    </button>
                  </span>
                ))}
                <input
                  value={categoryInput}
                  onChange={(e) => setCategoryInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addToList(categoryInput, setCategoryInput, categories, setCategories);
                    }
                  }}
                  placeholder="พิมพ์แล้วกด Enter"
                />
              </div>
            </div>
            <div className="field">
              <label>แท็ก</label>
              <div className="tagbox">
                {tags.map((t, i) => (
                  <span key={t} className="tag">
                    <b>{t}</b>
                    <button type="button" onClick={() => setTags(tags.filter((_, idx) => idx !== i))}>
                      ×
                    </button>
                  </span>
                ))}
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addToList(tagInput, setTagInput, tags, setTags);
                    }
                  }}
                  placeholder="พิมพ์แล้วกด Enter"
                />
              </div>
            </div>
            <div className="field">
              <label>ความยาว (duration)</label>
              <input type="text" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="เช่น 120 นาที" />
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
              <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <button type="button" className={videoMode === "link" ? "btn btn-gold" : "btn btn-ghost"} onClick={() => setVideoMode("link")}>
                  วางลิงก์
                </button>
                <button type="button" className={videoMode === "upload" ? "btn btn-gold" : "btn btn-ghost"} onClick={() => setVideoMode("upload")}>
                  อัปโหลดไฟล์ (Bunny Stream)
                </button>
                <button type="button" className={videoMode === "jwplayer" ? "btn btn-gold" : "btn btn-ghost"} onClick={() => setVideoMode("jwplayer")}>
                  JWPlayer Media ID
                </button>
              </div>
              {videoMode === "link" && (
                <input type="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://stream.bunny.net/.../play.m3u8" />
              )}
              {videoMode === "upload" &&
                (videoUrl ? (
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
                ))}
              {videoMode === "upload" && videoProgress !== null && (
                <div className="upload-progress-track">
                  <div className="upload-progress-fill" style={{ width: `${Math.round(videoProgress)}%` }} />
                </div>
              )}
              {videoMode === "jwplayer" && (
                <div style={{ display: "grid", gap: 10 }}>
                  {!jwPlayerMediaId && (
                    <label className="upload-zone">
                      <input ref={jwVideoInput} type="file" accept="video/mp4,video/quicktime,video/x-matroska,video/webm,video/mp2t" onChange={onJwVideoPick} />
                      <div className="uz-icon">📡</div>
                      <div className="uz-text">คลิกหรือลากไฟล์วิดีโอมาวาง — อัปขึ้น R2 แล้วส่งเข้า JWPlayer อัตโนมัติ</div>
                      <div className="uz-hint">MP4 · MOV · MKV · WEBM · TS, สูงสุด 8GB</div>
                    </label>
                  )}
                  {jwR2Progress !== null && (
                    <div className="upload-progress-track">
                      <div className="upload-progress-fill" style={{ width: `${Math.round(jwR2Progress)}%` }} />
                    </div>
                  )}
                  {jwIngesting && <div className="hint">กำลังส่งวิดีโอเข้า JWPlayer…</div>}
                  <div className="row2">
                    <div className="field">
                      <label>JWPlayer Media ID</label>
                      <input type="text" value={jwPlayerMediaId} onChange={(e) => setJwPlayerMediaId(e.target.value)} placeholder="เช่น AbCdEfGh (หรืออัปโหลดไฟล์ด้านบน)" />
                    </div>
                    <div className="field">
                      <label>Iframe URL</label>
                      <input type="url" value={iframeUrl} onChange={(e) => setIframeUrl(e.target.value)} placeholder="auto-generated เมื่อมี Media ID" />
                    </div>
                  </div>
                  {jwPlayerMediaId && (
                    <button
                      type="button"
                      className="btn-ghost"
                      style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5, justifySelf: "start" }}
                      onClick={() => {
                        setJwPlayerMediaId("");
                        setIframeUrl("");
                        setVideoUrl("");
                        setJwIngestStatus(null);
                      }}
                    >
                      เปลี่ยนวิดีโอ
                    </button>
                  )}
                  {jwIngestStatus && <div className="hint">สถานะ JWPlayer: {jwIngestStatus}</div>}
                </div>
              )}
              <div className="field" style={{ marginTop: 12 }}>
                <label>Preview URL (hover clip)</label>
                <input type="url" value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)} placeholder="https://cdn.example.com/previews/video-preview.mp4" />
              </div>
            </div>
          </div>
        </div>

        <div className="rail">
          <div className="panel">
            <div className="panel-head">
              <span className="n">3</span>
              <h3>เว็บปลายทาง (WP Domains)</h3>
            </div>
            <p className="hint" style={{ marginBottom: 10 }}>
              เลือกไว้ล่วงหน้า — จะยังไม่เผยแพร่ทันที ต้องรอผ่านขั้นตอนอนุมัติก่อน
            </p>
            <div className="sel-bar">
              <span>
                <b style={{ color: "var(--text)" }}>{selectedSites.size}</b> / {sites.length} เว็บ
              </span>
              <a onClick={() => setSelectedSites(selectedSites.size === sites.length ? new Set() : new Set(sites.map((s) => s.id)))}>
                เลือกทั้งหมด
              </a>
            </div>
            {sites.length === 0 && <div className="empty">ยังไม่มีเว็บปลายทาง</div>}
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

          {canSubmitForReview ? (
            <>
              <button className="btn btn-gold btn-block" style={{ fontSize: 15, padding: 14, marginBottom: 10 }} onClick={handleSubmitReview} disabled={saving}>
                {saving ? "กำลังบันทึก…" : "ส่งตรวจสอบ"}
              </button>
              <button className="btn btn-ghost btn-block" onClick={handleSaveDraft} disabled={saving}>
                บันทึกร่าง
              </button>
            </>
          ) : (
            <button className="btn btn-gold btn-block" style={{ fontSize: 15, padding: 14 }} onClick={handleSaveDraft} disabled={saving}>
              {saving ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}
            </button>
          )}
        </div>
      </div>

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}
