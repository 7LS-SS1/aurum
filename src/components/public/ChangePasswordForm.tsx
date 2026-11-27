"use client";

import { useState, type FormEvent } from "react";
import styles from "./AccountSecurity.module.css";

const errors: Record<string, string> = {
  invalid_current_password: "รหัสผ่านปัจจุบันไม่ถูกต้อง",
  password_unchanged: "กรุณาใช้รหัสผ่านใหม่ที่ต่างจากรหัสผ่านปัจจุบัน",
  password_too_long: "รหัสผ่านใหม่ยาวเกิน 72 ไบต์ กรุณาใช้ข้อความสั้นลง",
  password_not_configured: "บัญชีนี้ยังไม่มีรหัสผ่านสำหรับเข้าสู่ระบบ",
  credentials_changed: "ข้อมูลรหัสผ่านเปลี่ยนไปแล้ว กรุณาลองใหม่",
  too_many_requests: "ลองหลายครั้งเกินไป กรุณารอ 10 นาทีแล้วลองใหม่",
  unauthorized: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่",
  validation_failed: "กรุณากรอกรหัสผ่านใหม่อย่างน้อย 12 ตัวอักษร",
};

export function ChangePasswordForm({ onChanged }: { onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const currentPassword = String(fields.get("currentPassword") ?? "");
    const newPassword = String(fields.get("newPassword") ?? "");

    setFeedback(null);
    if (newPassword !== fields.get("confirmPassword")) {
      setFeedback({ error: true, text: "รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน" });
      form.querySelector<HTMLInputElement>('[name="confirmPassword"]')?.focus();
      return;
    }
    if (new TextEncoder().encode(newPassword).length > 72) {
      setFeedback({ error: true, text: errors.password_too_long! });
      return;
    }

    setBusy(true);
    try {
      const result = await fetch("/api/public/account/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!result.ok) {
        const { error } = await result.json().catch(() => ({}));
        throw new Error(errors[error] || "เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาลองอีกครั้ง");
      }
      form.reset();
      setFeedback({ error: false, text: "เปลี่ยนรหัสผ่านแล้ว และออกจากระบบในอุปกรณ์อื่นแล้ว" });
      onChanged();
    } catch (error) {
      setFeedback({ error: true, text: error instanceof Error ? error.message : "เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาลองอีกครั้ง" });
    } finally {
      setBusy(false);
    }
  }

  return <form className={styles.passwordForm} onSubmit={submit} aria-labelledby="change-password-heading">
    <div>
      <h3 id="change-password-heading">เปลี่ยนรหัสผ่าน</h3>
      <p id="password-requirements">ใช้รหัสผ่านใหม่อย่างน้อย 12 ตัวอักษร หลังบันทึก อุปกรณ์อื่นจะต้องเข้าสู่ระบบใหม่</p>
    </div>
    <label>รหัสผ่านปัจจุบัน<input type="password" name="currentPassword" autoComplete="current-password" maxLength={72} required /></label>
    <label>รหัสผ่านใหม่<input type="password" name="newPassword" autoComplete="new-password" aria-describedby="password-requirements" minLength={12} maxLength={72} required /></label>
    <label>ยืนยันรหัสผ่านใหม่<input type="password" name="confirmPassword" autoComplete="new-password" minLength={12} maxLength={72} required /></label>
    {feedback && <p role={feedback.error ? "alert" : "status"} className={feedback.error ? styles.formError : styles.formSuccess}>{feedback.text}</p>}
    <button type="submit" className="ui-button ui-button--primary" disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึกรหัสผ่านใหม่"}</button>
  </form>;
}
