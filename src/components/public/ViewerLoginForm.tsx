"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api-client";

export function ViewerLoginForm({ callbackUrl = "/" }: { callbackUrl?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await apiFetch("/api/public/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      router.push(callbackUrl);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.message === "invalid_credentials") {
        setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      } else if (err instanceof ApiClientError && err.status === 429) {
        setError("พยายามเข้าสู่ระบบบ่อยเกินไป กรุณาลองใหม่ภายหลัง");
      } else {
        setError(err instanceof ApiClientError ? err.message : "เข้าสู่ระบบไม่สำเร็จ");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="field">
        <label>อีเมล</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
      </div>
      <div className="field">
        <label>รหัสผ่าน</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
      </div>
      {error && <p className="error-text">{error}</p>}
      <button className="btn btn-gold btn-block" type="submit" disabled={pending} style={{ marginTop: 8 }}>
        {pending ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
      </button>
    </form>
  );
}
