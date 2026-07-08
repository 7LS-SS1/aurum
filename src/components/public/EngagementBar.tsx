"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api-client";

interface EngagementBarProps {
  movieKey: string;
  initialLikes: number;
  initialDislikes: number;
  initialViewerReaction: "LIKE" | "DISLIKE" | null;
  isLoggedIn: boolean;
  embedCode: string;
}

export function EngagementBar({ movieKey, initialLikes, initialDislikes, initialViewerReaction, isLoggedIn, embedCode }: EngagementBarProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [likes, setLikes] = useState(initialLikes);
  const [dislikes, setDislikes] = useState(initialDislikes);
  const [reaction, setReaction] = useState(initialViewerReaction);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  function requireLogin() {
    router.push(`/login?callbackUrl=${encodeURIComponent(pathname)}`);
  }

  async function react(type: "LIKE" | "DISLIKE") {
    if (!isLoggedIn) return requireLogin();
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ likes: number; dislikes: number; viewerReaction: "LIKE" | "DISLIKE" | null }>(
        `/api/public/movies/${movieKey}/reactions`,
        { method: "POST", body: JSON.stringify({ type }) },
      );
      setLikes(res.likes);
      setDislikes(res.dislikes);
      setReaction(res.viewerReaction);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) requireLogin();
    } finally {
      setBusy(false);
    }
  }

  async function copyEmbedCode() {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="actions">
      <div className="like-pill">
        <button className={`lk ${reaction === "LIKE" ? "on" : ""}`} onClick={() => react("LIKE")} disabled={busy}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 10v11M2 13v6a2 2 0 0 0 2 2h12.3a2 2 0 0 0 2-1.6l1.4-7A2 2 0 0 0 17.7 10H13l1-4.5A2 2 0 0 0 12 3l-5 7" />
          </svg>
          <span>{likes}</span>
        </button>
        <span className="sep" />
        <button className={`dk ${reaction === "DISLIKE" ? "on" : ""}`} onClick={() => react("DISLIKE")} disabled={busy}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 14V3M22 11V5a2 2 0 0 0-2-2H7.7a2 2 0 0 0-2 1.6l-1.4 7A2 2 0 0 0 6.3 14H11l-1 4.5A2 2 0 0 0 12 21l5-7" />
          </svg>
          <span>{dislikes}</span>
        </button>
      </div>

      <button className="pill" onClick={() => setShareOpen((open) => !open)} type="button">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
          <path d="M16 6l-4-4-4 4" />
          <path d="M12 2v14" />
        </svg>
        แชร์
      </button>

      {shareOpen && (
        <div className="share-panel">
          <div className="share-panel-head">
            <strong>Embed iframe</strong>
            <button type="button" onClick={() => setShareOpen(false)} aria-label="ปิด">
              ×
            </button>
          </div>
          <textarea value={embedCode} readOnly rows={4} />
          <button className="btn btn-gold btn-block" type="button" onClick={copyEmbedCode}>
            {copied ? "คัดลอกแล้ว" : "คัดลอก code"}
          </button>
        </div>
      )}
    </div>
  );
}
