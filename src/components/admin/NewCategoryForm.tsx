"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api-client";

export function NewCategoryForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return notify("กรุณากรอกชื่อหมวดหมู่");
    setSaving(true);
    try {
      await apiFetch("/api/categories", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
      router.push("/admin/categories");
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
        <h3>เพิ่มหมวดหมู่ใหม่</h3>
      </div>
      <div className="field">
        <label>
          ชื่อหมวดหมู่ <span className="req">*</span>
        </label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ดราม่า" />
      </div>
      <button className="btn btn-gold btn-block" type="submit" disabled={saving}>
        เพิ่มหมวดหมู่
      </button>
      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </form>
  );
}
