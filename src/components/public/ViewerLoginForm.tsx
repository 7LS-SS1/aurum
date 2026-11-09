"use client";

import { safeMemberReturn } from "@/lib/member-validation";
import { Alert, Button, Stack, TextField } from "@mui/material";
import { useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api-client";

export function ViewerLoginForm({ callbackUrl = "/" }: { callbackUrl?: string }) {
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
      window.location.assign(safeMemberReturn(callbackUrl));
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

  return <Stack component="form" onSubmit={onSubmit} spacing={3}><TextField label="อีเมล" type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="username"/><TextField label="รหัสผ่าน" type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/>{error && <Alert severity="error">{error}</Alert>}<Button variant="contained" type="submit" disabled={pending}>{pending ? "กำลังดำเนินการ…" : "เข้าสู่ระบบ"}</Button><Button component="a" href="/account/recovery">ลืมรหัสผ่าน</Button></Stack>;
}
