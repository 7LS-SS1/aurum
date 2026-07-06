"use client";

import { useState, useTransition } from "react";
import { apiFetch, ApiClientError } from "@/lib/api-client";

interface CommentRow {
  id: string;
  body: string;
  createdAt: string;
  movieId: string;
  viewer: { displayName: string; email: string };
  movie: { title: string };
}

export function CommentsManager({ initialComments }: { initialComments: CommentRow[] }) {
  const [comments, setComments] = useState(initialComments);
  const [movieId, setMovieId] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  function applyFilter() {
    startTransition(async () => {
      try {
        const params = new URLSearchParams();
        if (movieId.trim()) params.set("movieId", movieId.trim());
        const res = await apiFetch<{ comments: CommentRow[] }>(`/api/comments?${params.toString()}`);
        setComments(res.comments);
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "โหลดไม่สำเร็จ");
      }
    });
  }

  function removeComment(id: string) {
    if (!confirm("ลบคอมเมนต์นี้ใช่หรือไม่?")) return;
    startTransition(async () => {
      try {
        await apiFetch(`/api/comments/${id}`, { method: "DELETE" });
        setComments((prev) => prev.filter((c) => c.id !== id));
        notify("ลบคอมเมนต์แล้ว");
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "ลบไม่สำเร็จ");
      }
    });
  }

  return (
    <div>
      <div className="filter-bar">
        <input
          type="text"
          value={movieId}
          onChange={(e) => setMovieId(e.target.value)}
          placeholder="กรองตาม movie id"
          style={{ minWidth: 220 }}
        />
        <button className="btn btn-ghost" disabled={pending} onClick={applyFilter}>
          ค้นหา
        </button>
      </div>

      <div className="panel" style={{ overflowX: "auto" }}>
        {comments.length === 0 ? (
          <div className="empty">ไม่มีคอมเมนต์</div>
        ) : (
          <table className="dtable">
            <thead>
              <tr>
                <th>เวลา</th>
                <th>วิดีโอ</th>
                <th>ผู้ชม</th>
                <th>ข้อความ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {comments.map((c) => (
                <tr key={c.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{new Date(c.createdAt).toLocaleString("th-TH")}</td>
                  <td>{c.movie.title}</td>
                  <td>{c.viewer.displayName || c.viewer.email}</td>
                  <td style={{ maxWidth: 420, overflowWrap: "anywhere" }}>{c.body}</td>
                  <td>
                    <button className="btn btn-ghost" disabled={pending} onClick={() => removeComment(c.id)}>
                      ลบ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}
