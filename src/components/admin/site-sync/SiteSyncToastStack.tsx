"use client";

import { phaseLabelTh, statusBadgeClass, type PublicSyncJob } from "./types";
import { useEffect, useRef, useState } from "react";
import styles from "./SiteSyncToastStack.module.css";

interface ToastEntry {
  job: PublicSyncJob;
  siteName: string;
}

/** Only the front card consumes its ten seconds; dismissal never cancels a job. */
export function SiteSyncToastStack({ toasts, onDismiss }: { toasts: ToastEntry[]; onDismiss: (siteId: string) => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  if (toasts.length === 0) return null;

  const ordered = [...toasts].sort((a, b) => b.job.createdAt.localeCompare(a.job.createdAt));

  return (
    <div className={`sync-toast-stack ${styles.stack}`} aria-label="แจ้งเตือนการซิงก์"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
      {ordered.length > 1 && <span className={styles.count}>อีก {ordered.length - 1} รายการ</span>}
      {ordered.slice(0, 3).map(({ job, siteName }, index) => (
        <div key={job.id} className={`sync-toast ${styles.card}`} data-depth={index}
          aria-hidden={index > 0} inert={index > 0}>
          <div className="sync-toast-head">
            <span className={`badge ${statusBadgeClass(job.status)}`}>{phaseLabelTh(job.phase)}</span>
            <strong className="sync-toast-site">{siteName}</strong>
            <button className="sync-toast-close" onClick={() => {
              if (toasts.length === 1) { setHovered(false); setFocused(false); }
              onDismiss(job.siteId);
            }} aria-label="ปิด">
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
          {index === 0 && <ToastCountdown key={job.id} paused={hovered || focused} onExpire={() => onDismiss(job.siteId)} />}
        </div>
      ))}
    </div>
  );
}

function ToastCountdown({ paused, onExpire }: { paused: boolean; onExpire: () => void }) {
  const remaining = useRef(10_000);
  const [fraction, setFraction] = useState(1);
  const expire = useRef(onExpire);
  useEffect(() => { expire.current = onExpire; }, [onExpire]);
  useEffect(() => {
    if (paused) return;
    let previous = performance.now();
    let frame: number;
    const tick = (now: number) => {
      remaining.current = Math.max(0, remaining.current - (now - previous));
      previous = now;
      setFraction(remaining.current / 10_000);
      if (remaining.current === 0) expire.current();
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [paused]);
  return <div className={styles.timeout} aria-hidden="true"><div style={{ transform: `scaleX(${fraction})` }} /></div>;
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
