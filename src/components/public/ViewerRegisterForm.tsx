"use client";

import { safeMemberReturn } from "@/lib/member-validation";
import { Alert, Button, Stack, TextField } from "@mui/material";
import { useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api-client";

export function ViewerRegisterForm({ callbackUrl = "/" }: { callbackUrl?: string }) {
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
      window.location.assign(safeMemberReturn(callbackUrl));
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

  return <Stack component="form" onSubmit={onSubmit} spacing={3}><TextField label="ชื่อที่แสดง" value={displayName} onChange={e=>setDisplayName(e.target.value)} required autoComplete="nickname" slotProps={{htmlInput:{minLength:2,maxLength:60}}}/><TextField label="อีเมล" type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="username"/><TextField label="รหัสผ่าน" type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="new-password" helperText="อย่างน้อย 8 ตัวอักษร" slotProps={{htmlInput:{minLength:8}}}/>{error && <Alert severity="error">{error}</Alert>}<Button variant="contained" type="submit" disabled={pending}>{pending ? "กำลังดำเนินการ…" : "สมัครสมาชิก"}</Button></Stack>;
}
