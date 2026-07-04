"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api-client";

export interface CommentRow {
  id: string;
  body: string;
  createdAt: string;
  viewerId: string;
  viewer: { displayName: string };
}

export function CommentSection({
  movieKey,
  initialComments,
  isLoggedIn,
  viewerId,
}: {
  movieKey: string;
  initialComments: CommentRow[];
  isLoggedIn: boolean;
  viewerId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [comments, setComments] = useState(initialComments);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoggedIn) {
      router.push(`/login?callbackUrl=${encodeURIComponent(pathname)}`);
      return;
    }
    const trimmed = body.trim();
    if (!trimmed) return;
    setPosting(true);
    setError(null);
    try {
      const { comment } = await apiFetch<{ comment: CommentRow }>(`/api/public/movies/${movieKey}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: trimmed }),
      });
      setComments((prev) => [comment, ...prev]);
      setBody("");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "แสดงความคิดเห็นไม่สำเร็จ");
    } finally {
      setPosting(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("ลบความคิดเห็นนี้?")) return;
    try {
      await apiFetch(`/api/public/comments/${id}`, { method: "DELETE" });
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch {
      // best-effort — leave the comment in place if delete failed
    }
  }

  return (
    <div className="comments">
      <div className="cmt-head">
        <span>{comments.length.toLocaleString("th-TH")} ความคิดเห็น</span>
      </div>
      <form className="cmt-input-row" onSubmit={submit}>
        <div className="cmt-input">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={isLoggedIn ? "เพิ่มความคิดเห็น..." : "เข้าสู่ระบบเพื่อแสดงความคิดเห็น"}
          />
          {body.trim() && (
            <div className="cmt-btns">
              <button type="button" className="cmt-cancel" onClick={() => setBody("")}>
                ยกเลิก
              </button>
              <button type="submit" className="cmt-send" disabled={posting}>
                {posting ? "กำลังส่ง..." : "แสดงความคิดเห็น"}
              </button>
            </div>
          )}
        </div>
      </form>
      {error && <p className="error-text">{error}</p>}
      <div>
        {comments.map((c) => (
          <div className="cmt" key={c.id}>
            <div className="cmt-av">{c.viewer.displayName.charAt(0).toUpperCase()}</div>
            <div className="cmt-body">
              <div className="cmt-top">
                <span className="cmt-name">{c.viewer.displayName}</span>
                <span className="cmt-time">{new Date(c.createdAt).toLocaleDateString("th-TH")}</span>
              </div>
              <div className="cmt-text">{c.body}</div>
              {viewerId === c.viewerId && (
                <div className="cmt-acts">
                  <span onClick={() => remove(c.id)}>ลบ</span>
                </div>
              )}
            </div>
          </div>
        ))}
        {comments.length === 0 && <p className="hint">ยังไม่มีความคิดเห็น — เป็นคนแรกที่แสดงความคิดเห็น</p>}
      </div>
    </div>
  );
}
