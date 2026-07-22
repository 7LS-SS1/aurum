"use client";

import { phaseLabelTh, statusBadgeClass, type PublicSyncJob } from "./types";

interface ToastEntry {
  job: PublicSyncJob;
  siteName: string;
}

/**
 * Deliberately does NOT auto-dismiss on a fixed timer the way the simple
 * `.toast` in SitesManager does (2.4s) — a sync job can run far longer than
 * that, so each toast stays until the job settles (then the user can read
 * the final result) or the user closes it manually. Multiple sites syncing
 * at once each get their own stacked entry with independent progress.
 */
export function SiteSyncToastStack({ toasts, onDismiss }: { toasts: ToastEntry[]; onDismiss: (siteId: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="sync-toast-stack">
      {toasts.map(({ job, siteName }) => (
        <div key={job.id} className="sync-toast">
          <div className="sync-toast-head">
            <span className={`badge ${statusBadgeClass(job.status)}`}>{phaseLabelTh(job.phase)}</span>
            <strong className="sync-toast-site">{siteName}</strong>
            <button className="sync-toast-close" onClick={() => onDismiss(job.siteId)} aria-label="ปิด">
              ×
            </button>
          </div>
          <div className="sync-progress-track">
            <div className="sync-progress-bar" style={{ width: `${job.progress}%` }} />
          </div>
          <div className="sync-toast-meta">
            {job.progress}% · ส่งสำเร็จ {job.successCount}{job.failedCount > 0 ? ` · ล้มเหลว ${job.failedCount}` : ""}
          </div>
          {job.status === "FAILED" && job.errorMessage && <div className="sync-job-error">{job.errorMessage}</div>}
        </div>
      ))}
    </div>
  );
}

export function buildToastEntries(
  jobsBySite: Record<string, PublicSyncJob | undefined>,
  siteNameById: Record<string, string>,
  dismissed: Record<string, boolean>,
): ToastEntry[] {
  return Object.values(jobsBySite)
    .filter((job): job is PublicSyncJob => !!job && !dismissed[job.id])
    .map((job) => ({ job, siteName: siteNameById[job.siteId] ?? job.site?.name ?? "เว็บไซต์" }));
}
