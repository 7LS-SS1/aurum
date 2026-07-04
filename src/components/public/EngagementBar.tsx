"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api-client";

interface EngagementBarProps {
  movieKey: string;
  initialLikes: number;
  initialDislikes: number;
  initialViewerReaction: "LIKE" | "DISLIKE" | null;
  initialSaved: boolean;
  isLoggedIn: boolean;
}

export function EngagementBar({ movieKey, initialLikes, initialDislikes, initialViewerReaction, initialSaved, isLoggedIn }: EngagementBarProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [likes, setLikes] = useState(initialLikes);
  const [dislikes, setDislikes] = useState(initialDislikes);
  const [reaction, setReaction] = useState(initialViewerReaction);
  const [saved, setSaved] = useState(initialSaved);
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

  async function toggleSave() {
    if (!isLoggedIn) return requireLogin();
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ saved: boolean }>(`/api/public/movies/${movieKey}/watch-later`, { method: "POST" });
      setSaved(res.saved);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) requireLogin();
    } finally {
      setBusy(false);
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
      <button className={`pill ${saved ? "saved" : ""}`} onClick={toggleSave} disabled={busy}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 4h12a1 1 0 0 1 1 1v16l-7-4-7 4V5a1 1 0 0 1 1-1z" />
        </svg>
        {saved ? "บันทึกแล้ว" : "บันทึก"}
      </button>
    </div>
  );
}
