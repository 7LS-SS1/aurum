"use client";

import { isActiveSyncStatus, phaseLabelTh, statusBadgeClass, type PublicSyncJob, type SyncJobLog } from "./types";

function logLevelClass(level: SyncJobLog["level"]): string {
  if (level === "ERROR") return "bad";
  if (level === "WARN") return "warn";
  return "neutral";
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Circular-arrows glyph — spins while a job is active, static otherwise. Inline SVG, no icon library dependency. */
function SyncGlyph({ spinning }: { spinning: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" className={spinning ? "sync-icon-spin" : undefined} aria-hidden="true">
      <path
        d="M4 12a8 8 0 0 1 13.66-5.66M20 12a8 8 0 0 1-13.66 5.66M17 4v4h-4M7 20v-4h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Compact icon-only trigger meant to sit inline with a site row's other
 * action buttons (before "ตรวจสอบ"). Clicking starts a sync; while one is
 * already active it's disabled and spins in place so double-clicking can't
 * queue a second job for the same site (the server enforces this too — see
 * job-service.ts's activeSiteId unique constraint — this is just the UI's
 * first line of defense/feedback).
 */
export function SiteSyncIconButton({ job, disabled, onStart }: { job: PublicSyncJob | undefined; disabled: boolean; onStart: () => void }) {
  const active = job ? isActiveSyncStatus(job.status) : false;
  const title = active
    ? `กำลังซิงก์วิดีโอเก่า (${job?.progress ?? 0}%)`
    : job?.status === "FAILED"
      ? "ซิงก์วิดีโอเก่า (ลองใหม่) — ตรวจสอบวิดีโอที่ยังไม่มีบนเว็บนี้แล้วส่งทันทีผ่าน background job"
      : "ซิงก์วิดีโอเก่า — ตรวจสอบวิดีโอที่ยังไม่มีบนเว็บนี้แล้วส่งทันทีผ่าน background job";

  return (
    <button
      className={`icon-btn sync-icon-btn ${active ? "active" : ""}`}
      disabled={disabled || active}
      onClick={onStart}
      title={title}
      aria-label={title}
    >
      <SyncGlyph spinning={active} />
    </button>
  );
}

/**
 * Progress bar / counters / log panel — rendered below the site row only
 * while there's something actionable to show (a run in progress, or a
 * failed run waiting on "ลองใหม่"). A finished run's final numbers surface
 * via the toast stack instead, so the site list doesn't stay cluttered with
 * old results.
 */
export function SiteSyncDetailPanel({
  job,
  logs,
  expanded,
  errorMessage,
  disabled,
  onCancel,
  onRetry,
  onToggleLogs,
}: {
  job: PublicSyncJob | undefined;
  logs: SyncJobLog[];
  expanded: boolean;
  errorMessage: string | undefined;
  disabled: boolean;
  onCancel: () => void;
  onRetry: () => void;
  onToggleLogs: () => void;
}) {
  const active = job ? isActiveSyncStatus(job.status) : false;
  const showPanel = active || job?.status === "FAILED" || (expanded && !!job);
  if (!showPanel && !errorMessage) return null;

  return (
    <div className="sync-row-controls">
      {active && (
        <button className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5, color: "var(--red)" }} disabled={disabled} onClick={onCancel}>
          ยกเลิกการซิงก์
        </button>
      )}
      {job?.status === "FAILED" && (
        <button className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5 }} disabled={disabled} onClick={onRetry}>
          ลองใหม่
        </button>
      )}

      {job && showPanel && (
        <div className="sync-job-summary">
          <div className="sync-job-head">
            <span className={`badge ${statusBadgeClass(job.status)}`}>{phaseLabelTh(job.phase)}</span>
            <div className="sync-progress-track" aria-label={`ความคืบหน้า ${job.progress}%`}>
              <div className="sync-progress-bar" style={{ width: `${job.progress}%` }} />
            </div>
            <span className="sync-progress-pct">{job.progress}%</span>
            <button className="btn-ghost sync-log-toggle" onClick={onToggleLogs}>
              {expanded ? "ซ่อนบันทึก" : "ดูบันทึก"}
            </button>
          </div>
          <div className="sync-job-counters">
            <span>ทั้งหมด {job.totalMovies}</span>
            <span>พบแล้ว {job.skippedMovies}</span>
            <span>ต้องส่ง {job.queuedMovies}</span>
            <span>ส่งสำเร็จ {job.successCount}</span>
            <span className={job.failedCount > 0 ? "sync-counter-bad" : undefined}>ล้มเหลว {job.failedCount}</span>
          </div>
          {job.errorMessage && <div className="sync-job-error">{job.errorMessage}</div>}
        </div>
      )}

      {errorMessage && <div className="sync-job-error">{errorMessage}</div>}

      {expanded && job && (
        <div className="sync-log-panel">
          {logs.length === 0 && <div className="empty">ยังไม่มีบันทึก</div>}
          {logs.map((log) => (
            <div key={log.id} className="sync-log-line">
              <span className="sync-log-time">{formatTime(log.createdAt)}</span>
              <span className={`badge ${logLevelClass(log.level)} sync-log-level`}>{log.level}</span>
              <span className="sync-log-message">{log.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
