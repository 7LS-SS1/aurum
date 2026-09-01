"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api-client";

export function NewComicTagForm() {
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
    if (!name.trim()) return notify("กรุณากรอกชื่อแท็กอย่างน้อย 1 แท็ก");
    setSaving(true);
    try {
      const created = await apiFetch<unknown[]>("/api/comic-tags", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
      notify(`เพิ่มแท็กแล้ว ${created.length} รายการ`);
      router.push("/admin/comic-tags");
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
        <h3>เพิ่มแท็กคอมมิคใหม่</h3>
      </div>
      <div className="field">
        <label>
          ชื่อแท็ก <span className="req">*</span>
        </label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น โดจิน, ตอนจบ, เอเชีย" />
        <div className="hint">เพิ่มได้หลายแท็กพร้อมกันโดยคั่นด้วยเครื่องหมาย , เช่น &ldquo;โดจิน, ตอนจบ&rdquo;</div>
      </div>
      <button className="btn btn-gold btn-block" type="submit" disabled={saving}>
        เพิ่มแท็ก
      </button>
      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </form>
  );
}
