"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api-client";

export function NewComicSeriesForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return notify("กรุณากรอกชื่อซีรีส์");
    setSaving(true);
    try {
      await apiFetch("/api/comic-series", { method: "POST", body: JSON.stringify({ title: title.trim(), description: description.trim() || undefined }) });
      router.push("/admin/comic-series");
      router.refresh();
    } catch (err) {
      notify(err instanceof ApiClientError ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="panel" onSubmit={save}>
      <div className="panel-head">
        <h3>เพิ่มซีรีส์ใหม่</h3>
      </div>
      <div className="field">
        <label>
          ชื่อซีรีส์ <span className="req">*</span>
        </label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น ผลงานของนักเขียนคนเดียวกัน" />
      </div>
      <div className="field">
        <label>คำอธิบาย</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="คำอธิบายเพิ่มเติม (ไม่บังคับ)" />
      </div>
      <button className="btn btn-gold btn-block" type="submit" disabled={saving}>
        เพิ่มซีรีส์
      </button>
      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </form>
  );
}
