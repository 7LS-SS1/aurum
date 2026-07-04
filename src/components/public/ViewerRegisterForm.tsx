"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api-client";

export function ViewerRegisterForm({ callbackUrl = "/" }: { callbackUrl?: string }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await apiFetch("/api/public/auth/register", { method: "POST", body: JSON.stringify({ displayName, email, password }) });
      router.push(callbackUrl);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409) {
        setError("อีเมลนี้ถูกใช้ไปแล้ว");
      } else if (err instanceof ApiClientError && err.status === 429) {
        setError("สมัครสมาชิกบ่อยเกินไป กรุณาลองใหม่ภายหลัง");
      } else {
        setError(err instanceof ApiClientError ? err.message : "สมัครสมาชิกไม่สำเร็จ");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="field">
        <label>ชื่อที่แสดง</label>
        <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required minLength={2} maxLength={60} autoComplete="nickname" />
      </div>
      <div className="field">
        <label>อีเมล</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      </div>
      <div className="field">
        <label>รหัสผ่าน</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
        <div className="hint">อย่างน้อย 8 ตัวอักษร</div>
      </div>
      {error && <p className="error-text">{error}</p>}
      <button className="btn btn-gold btn-block" type="submit" disabled={pending} style={{ marginTop: 8 }}>
        {pending ? "กำลังสมัครสมาชิก..." : "สมัครสมาชิก"}
      </button>
    </form>
  );
}
