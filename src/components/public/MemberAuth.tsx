"use client";
import { useEffect, useState } from "react";
import { ViewerRegisterForm } from "./ViewerRegisterForm";
import { ViewerLoginForm } from "./ViewerLoginForm";
import { safeMemberReturn } from "@/lib/member-validation";
import styles from "./Member.module.css";
export function MemberAuth({ register, callbackUrl }: { register: boolean; callbackUrl: string }) {
  const [method, setMethod] = useState("email");
  const [enabled, setEnabled] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { fetch("/api/public/auth/phone").then(r => r.json()).then(data => setEnabled(data.enabled === true)).catch(() => setEnabled(false)); }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/public/auth/phone", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, action: sent ? "verify" : "send", ...(sent ? { code } : {}), ...(name ? { displayName: name } : {}) }) });
      const data = await response.json();
      if (!response.ok) { setMessage(data.error === "too_many_requests" ? "ทำรายการบ่อยเกินไป กรุณารอสักครู่" : data.error === "sms_not_configured" || data.error === "sms_unavailable" ? "ยังส่ง SMS ไม่ได้ กรุณาสมัครด้วยอีเมลหรือติดต่อทีมงาน" : "ตรวจสอบเบอร์โทรหรือรหัส OTP แล้วลองอีกครั้ง"); return; }
      if (sent) { window.location.assign(safeMemberReturn(callbackUrl)); } else { setSent(true); setMessage("ส่ง OTP แล้ว กรุณาตรวจข้อความ SMS"); }
    } catch { setMessage("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่"); } finally { setBusy(false); }
  }
  return <><div className={styles.tabs} role="group" aria-label="วิธีสมัครหรือเข้าสู่ระบบ"><button type="button" aria-pressed={method === "email"} onClick={() => setMethod("email")}>อีเมล</button><button type="button" aria-pressed={method === "phone"} onClick={() => setMethod("phone")}>เบอร์โทรศัพท์</button></div>
    {method === "email" ? register ? <ViewerRegisterForm callbackUrl={safeMemberReturn(callbackUrl)} /> : <ViewerLoginForm callbackUrl={safeMemberReturn(callbackUrl)} /> : <form onSubmit={submit}>
      <p className={styles.hint}>ใช้ OTP ยืนยันเบอร์โทร ไม่ต้องตั้งรหัสผ่าน หากยังไม่มีบัญชี ระบบจะสร้างบัญชีหลังยืนยันสำเร็จ</p>
      {!enabled && <p role="status" className={styles.hint}>ขณะนี้ยังไม่เปิดบริการ SMS กรุณาใช้การสมัครด้วยอีเมล</p>}
      {register && <label className={styles.field}>ชื่อที่แสดง<input value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={60} required autoComplete="nickname" /></label>}
      <label className={styles.field}>เบอร์มือถือ<input type="tel" autoComplete="tel" value={phone} onChange={e => { setPhone(e.target.value); setSent(false); setCode(""); }} required placeholder="0812345678 หรือ +66812345678" maxLength={30} /></label>
      {sent && <label className={styles.field}>รหัส OTP 6 หลัก<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} pattern="[0-9]{6}" minLength={6} maxLength={6} required /></label>}
      {message && <p role="status" className={styles.hint}>{message}</p>}
      <button className={styles.button} disabled={busy || !enabled}>{busy ? "กำลังดำเนินการ…" : sent ? "ยืนยันและเข้าสู่ระบบ" : "รับรหัส OTP"}</button>
      {sent && <button type="button" className={styles.button} disabled={busy} onClick={() => { setSent(false); setCode(""); }}>ขอรหัสใหม่</button>}
    </form>}</>;
}
