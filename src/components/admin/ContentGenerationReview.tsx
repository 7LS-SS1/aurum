"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api-client";

type ContentItem = {
  id: string;
  movieId: string;
  siteId: string;
  status: string;
  sourceTitle: string;
  sourceDescription: string;
  sourceCategories: unknown;
  sourceTags: unknown;
  sourceActors: unknown;
  sourceFingerprint: string;
  generatedTitleShort: string | null;
  generatedTitleLong: string | null;
  generatedDescriptionShort: string | null;
  generatedDescriptionLong: string | null;
  focusKeyword: string | null;
  draftTitle: string | null;
  draftDescription: string | null;
  draftFocusKeyword: string | null;
  draftFingerprint: string | null;
  trendKeywords: unknown;
  retryCount: number;
  nextRetryAt: string | null;
  errorMessage: string | null;
  generatedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  movie: { title: string };
  site: { name: string; baseUrl: string };
};

type JobDetail = {
  id: string;
  provider: string;
  model: string;
  status: string;
  phase: string;
  totalItems: number;
  processedItems: number;
  readyItems: number;
  approvedItems: number;
  rejectedItems: number;
  failedItems: number;
  createdAt: string;
  items: ContentItem[];
  logs: { id: string; level: string; event: string; message: string; itemId: string | null; createdAt: string }[];
};

type DraftState = { title: string; description: string; focusKeyword: string; reason: string; dirty: boolean };

const ITEM_STATUS: Record<string, { label: string; tone: string }> = {
  QUEUED: { label: "รอสร้าง", tone: "neutral" },
  GENERATING: { label: "กำลังสร้าง", tone: "gold" },
  READY_FOR_REVIEW: { label: "รอตรวจ", tone: "warn" },
  APPROVED: { label: "อนุมัติแล้ว", tone: "ok" },
  REJECTED: { label: "ปฏิเสธ", tone: "neutral" },
  FAILED: { label: "ล้มเหลว", tone: "bad" },
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function draftFromItem(item: ContentItem): DraftState {
  return {
    title: item.draftTitle ?? "",
    description: item.draftDescription ?? "",
    focusKeyword: item.draftFocusKeyword ?? "",
    reason: item.rejectionReason ?? "",
    dirty: false,
  };
}

export function ContentGenerationReview({ initialJob }: { initialJob: JobDetail }) {
  const [job, setJob] = useState(initialJob);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>(() => Object.fromEntries(initialJob.items.map(item => [item.id, draftFromItem(item)])));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const active = ["QUEUED", "PROCESSING"].includes(job.status);
  const progress = job.totalItems ? Math.round((job.processedItems / job.totalItems) * 100) : 0;

  function mergeJob(next: JobDetail) {
    setJob(next);
    setDrafts(current => {
      const merged = { ...current };
      for (const item of next.items) {
        if (!merged[item.id]?.dirty) merged[item.id] = draftFromItem(item);
      }
      return merged;
    });
  }

  async function refresh() {
    const result = await apiFetch<{ job: JobDetail }>(`/api/content-generation/jobs/${job.id}`);
    mergeJob(result.job);
  }

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => void refresh().catch(() => undefined), 3000);
    return () => window.clearInterval(timer);
    // job.id is stable; active changes stop polling when generation settles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, job.id]);

  function updateDraft(id: string, patch: Partial<DraftState>) {
    setDrafts(current => ({
      ...current,
      [id]: {
        title: current[id]?.title ?? "",
        description: current[id]?.description ?? "",
        focusKeyword: current[id]?.focusKeyword ?? "",
        reason: current[id]?.reason ?? "",
        ...patch,
        dirty: true,
      },
    }));
  }

  async function approve(item: ContentItem) {
    const draft = drafts[item.id];
    if (!draft || !item.draftFingerprint) return;
    setBusyId(item.id);
    setMessage("");
    try {
      const result = await apiFetch<{ item: ContentItem; warnings: string[] }>(`/api/content-generation/items/${item.id}/approve`, {
        method: "POST",
        body: JSON.stringify({
          expectedSourceFingerprint: item.sourceFingerprint,
          expectedDraftFingerprint: item.draftFingerprint,
          draftTitle: draft.title,
          draftDescription: draft.description,
          draftFocusKeyword: draft.focusKeyword,
        }),
      });
      setJob(current => ({ ...current, items: current.items.map(entry => entry.id === item.id ? { ...entry, ...result.item } : entry) }));
      setDrafts(current => ({ ...current, [item.id]: { ...draftFromItem(result.item), dirty: false } }));
      setMessage(result.warnings.length ? "อนุมัติแล้ว แต่พบชื่อเดียวกันบนเว็บไซต์อื่น กรุณาตรวจสอบก่อนนำไปเผยแพร่" : "อนุมัติ draft แล้ว — ยังไม่มีการส่งไป WordPress");
      await refresh();
    } catch (error) {
      setMessage(error instanceof ApiClientError ? error.message : "อนุมัติไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(item: ContentItem) {
    const draft = drafts[item.id];
    if (!draft?.reason.trim() || !item.draftFingerprint) {
      setMessage("กรอกเหตุผลก่อนปฏิเสธ draft");
      return;
    }
    setBusyId(item.id);
    setMessage("");
    try {
      await apiFetch(`/api/content-generation/items/${item.id}/reject`, {
        method: "POST",
        body: JSON.stringify({
          expectedSourceFingerprint: item.sourceFingerprint,
          expectedDraftFingerprint: item.draftFingerprint,
          reason: draft.reason.trim(),
        }),
      });
      setMessage("ปฏิเสธ draft แล้ว");
      await refresh();
    } catch (error) {
      setMessage(error instanceof ApiClientError ? error.message : "ปฏิเสธไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  async function cancel() {
    setMessage("");
    try {
      await apiFetch(`/api/content-generation/jobs/${job.id}/cancel`, { method: "POST" });
      await refresh();
      setMessage("ยกเลิก Batch แล้ว");
    } catch (error) {
      setMessage(error instanceof ApiClientError ? error.message : "ยกเลิกไม่สำเร็จ");
    }
  }

  const grouped = useMemo(() => {
    return [...job.items].sort((a, b) => a.site.name.localeCompare(b.site.name, "th") || a.sourceTitle.localeCompare(b.sourceTitle, "th"));
  }, [job.items]);

  return (
    <div className="cg-review">
      <div className="cg-product-note"><strong>Approval gate เปิดอยู่</strong><span>Approve บันทึก draft และผู้อนุมัติเท่านั้น ไม่มี WordPress request</span></div>
      <div className="panel cg-job-hero">
        <div><span className="eyebrow">{job.provider.toUpperCase()} · {job.model}</span><h2>Batch {job.id.slice(-8)}</h2><p>{new Date(job.createdAt).toLocaleString("th-TH")}</p></div>
        <div className="cg-hero-stats"><strong>{progress}%</strong><span>{job.processedItems}/{job.totalItems} รายการ</span></div>
        {active && <button type="button" className="btn btn-ghost" onClick={cancel}>ยกเลิก Batch</button>}
      </div>
      <div className="sync-progress-track cg-main-progress"><div className="sync-progress-bar" style={{ width: `${progress}%` }} /></div>
      <div className="cg-summary-grid">
        <div><strong>{job.readyItems}</strong><span>รอตรวจ</span></div><div><strong>{job.approvedItems}</strong><span>อนุมัติแล้ว</span></div><div><strong>{job.rejectedItems}</strong><span>ปฏิเสธ</span></div><div><strong>{job.failedItems}</strong><span>ล้มเหลว</span></div>
      </div>
      {message && <div className="cg-inline-message" role="status">{message}</div>}
      <div className="cg-review-toolbar"><Link href="/admin/content-generation" className="btn btn-ghost">← กลับไปสร้าง Batch</Link><button type="button" className="btn btn-ghost" onClick={() => void refresh()}>รีเฟรชสถานะ</button></div>

      <div className="cg-review-list">
        {grouped.map(item => {
          const meta = ITEM_STATUS[item.status] ?? { label: item.status, tone: "neutral" };
          const draft = drafts[item.id] ?? draftFromItem(item);
          const canReview = item.status === "READY_FOR_REVIEW" && Boolean(item.draftFingerprint);
          return (
            <article className="panel cg-review-card" key={item.id}>
              <header><div><span className="eyebrow">{item.site.name}</span><h3>{item.sourceTitle}</h3><a href={item.site.baseUrl} target="_blank" rel="noreferrer">{item.site.baseUrl}</a></div><span className={`badge ${meta.tone}`}>{meta.label}</span></header>
              {item.status === "FAILED" && <div className="cg-error">{item.errorMessage ?? "สร้างไม่สำเร็จ"} · ลองแล้ว {item.retryCount} ครั้ง</div>}
              {item.nextRetryAt && <p className="hint">ลองใหม่หลัง {new Date(item.nextRetryAt).toLocaleString("th-TH")}</p>}
              <div className="cg-source-box"><strong>ข้อมูลต้นทาง</strong><p>{item.sourceDescription || "ไม่มีคำอธิบายเดิม"}</p><div className="cg-chip-row">{[...stringArray(item.sourceCategories), ...stringArray(item.sourceTags), ...stringArray(item.sourceActors)].map((value, index) => <span key={`${value}-${index}`}>{value}</span>)}</div></div>
              {item.draftFingerprint && (
                <div className="cg-editor-grid">
                  <div className="field"><label>Title สำหรับ {item.site.name}</label><input value={draft.title} disabled={!canReview || busyId === item.id} onChange={event => updateDraft(item.id, { title: event.target.value })} /></div>
                  <div className="field"><label>Focus Keyword</label><input value={draft.focusKeyword} disabled={!canReview || busyId === item.id} onChange={event => updateDraft(item.id, { focusKeyword: event.target.value })} /></div>
                  <div className="field cg-description-field"><label>Description</label><textarea rows={6} value={draft.description} disabled={!canReview || busyId === item.id} onChange={event => updateDraft(item.id, { description: event.target.value })} /></div>
                </div>
              )}
              {item.generatedAt && <details className="cg-variants"><summary>ดูตัวเลือกที่ AI สร้าง</summary><dl><dt>ชื่อสั้น</dt><dd>{item.generatedTitleShort}</dd><dt>ชื่อยาว</dt><dd>{item.generatedTitleLong}</dd><dt>คำอธิบายสั้น</dt><dd>{item.generatedDescriptionShort}</dd></dl></details>}
              {canReview && <div className="cg-review-actions"><button type="button" className="btn btn-gold" disabled={busyId === item.id || !draft.title.trim() || !draft.description.trim() || !draft.focusKeyword.trim()} onClick={() => void approve(item)}>Approve draft</button><input value={draft.reason} onChange={event => updateDraft(item.id, { reason: event.target.value })} placeholder="เหตุผลเมื่อต้องการ Reject" /><button type="button" className="btn btn-ghost" disabled={busyId === item.id || !draft.reason.trim()} onClick={() => void reject(item)}>Reject</button></div>}
              {item.status === "APPROVED" && <p className="cg-approved-note">อนุมัติเมื่อ {item.approvedAt ? new Date(item.approvedAt).toLocaleString("th-TH") : "-"} · รอขั้นตอนนำไปใช้แยกต่างหาก</p>}
              {item.status === "REJECTED" && <p className="cg-rejected-note">เหตุผล: {item.rejectionReason}</p>}
            </article>
          );
        })}
      </div>

      <details className="panel cg-job-logs"><summary>ประวัติ Worker ({job.logs.length})</summary>{job.logs.map(log => <div className="sync-log-line" key={log.id}><span className="sync-log-time">{new Date(log.createdAt).toLocaleTimeString("th-TH")}</span><span className={`badge sync-log-level ${log.level === "ERROR" ? "bad" : log.level === "WARN" ? "warn" : "neutral"}`}>{log.level}</span><span className="sync-log-message">{log.message}</span></div>)}</details>
    </div>
  );
}
