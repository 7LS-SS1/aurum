"use client";

import { useState } from "react";

export interface StatusBucket {
  key: string;
  label: string;
  count: number;
  /** One of the app's reserved status tokens — kept in sync with .badge.* in globals.css. */
  tone: "neutral" | "neutral-2" | "gold" | "ok" | "bad";
}

const TONE_VAR: Record<StatusBucket["tone"], string> = {
  neutral: "var(--muted)",
  "neutral-2": "var(--muted-2)",
  gold: "var(--gold-bright)",
  ok: "var(--ok)",
  bad: "var(--red)",
};

// Inline-label ink per fill, picked by contrast (computed, not eyeballed) —
// every tone but the mid-gray one reads better with dark ink than white.
const TONE_INK: Record<StatusBucket["tone"], string> = {
  neutral: "#1a1407",
  "neutral-2": "#ffffff",
  gold: "#1a1407",
  ok: "#1a1407",
  bad: "#1a1407",
};

/**
 * One horizontal stacked bar showing how the whole video library splits across
 * the workflow's five natural stages — a "pipeline health" strip, not a
 * per-status breakdown (11 raw statuses would be unreadable as bars/slices).
 * Segment colors are the app's existing reserved status tokens (same ones the
 * status badges use everywhere else), not a generated categorical palette.
 */
export function StatusBreakdownBar({ buckets }: { buckets: StatusBucket[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const total = buckets.reduce((sum, b) => sum + b.count, 0);

  if (total === 0) {
    return <div className="empty">ยังไม่มีวิดีโอในระบบ</div>;
  }

  return (
    <div className="status-strip">
      <div className="status-strip-bar">
        {buckets
          .filter((b) => b.count > 0)
          .map((b) => {
            const pct = (b.count / total) * 100;
            return (
              <div
                key={b.key}
                className={`status-strip-seg ${hovered === b.key ? "hovered" : ""}`}
                style={{ width: `${pct}%`, background: TONE_VAR[b.tone] }}
                tabIndex={0}
                onMouseEnter={() => setHovered(b.key)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(b.key)}
                onBlur={() => setHovered(null)}
              >
                {pct >= 12 && (
                  <span className="status-strip-inline" style={{ color: TONE_INK[b.tone] }}>
                    {b.count}
                  </span>
                )}
                {hovered === b.key && (
                  <div className="status-strip-tip">
                    <strong>{b.count.toLocaleString("th-TH")}</strong> {b.label} · {pct.toFixed(0)}%
                  </div>
                )}
              </div>
            );
          })}
      </div>
      <div className="status-strip-legend">
        {buckets.map((b) => (
          <div key={b.key} className="status-strip-legend-item">
            <span className="status-strip-swatch" style={{ background: TONE_VAR[b.tone] }} />
            <span>{b.label}</span>
            <strong>{b.count.toLocaleString("th-TH")}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
