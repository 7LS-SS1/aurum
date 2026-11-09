"use client";
import { useEffect, useState } from "react";
import styles from "./AccountSecurity.module.css";
type Session = { id: string; userAgent: string | null; createdAt: string; expiresAt: string; current: boolean };
function deviceLabel(agent: string | null) {
  if (!agent) return "ไม่ระบุอุปกรณ์";
  const platform = /Android/i.test(agent) ? "Android" : /iPhone|iPad/i.test(agent) ? "iOS" : /Windows/i.test(agent) ? "Windows" : /Macintosh/i.test(agent) ? "macOS" : /Linux/i.test(agent) ? "Linux" : "อุปกรณ์อื่น";
  const browser = /Edg\//.test(agent) ? "Edge" : /Firefox\//.test(agent) ? "Firefox" : /Chrome\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : "ไคลเอนต์";
  return `${browser} · ${platform}`;
}
export function AccountSecurity({ email }: { email: string | null }) {
  const [items, setItems] = useState<Session[]>([]), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState<boolean | null>(null), [loading, setLoading] = useState(true);
  async function load() {
    const response = await fetch("/api/public/account/sessions", { cache: "no-store" });
    if (!response.ok) throw Error("โหลดอุปกรณ์ไม่สำเร็จ กรุณาลองใหม่");
    setItems((await response.json()).items);
  }
  useEffect(() => {
    void load().catch(error => setMessage(error.message)).finally(() => setLoading(false));
    void fetch("/api/public/auth/recovery", { cache: "no-store" }).then(async response => {
      if (!response.ok) throw Error();
      setEmailEnabled((await response.json()).enabled === true);
    }).catch(() => setEmailEnabled(false));
  }, []);
  async function verify() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/public/auth/recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, purpose: "verify" }) });
      if (!response.ok) throw Error("ยังส่งอีเมลไม่ได้ กรุณาติดต่อทีมงาน");
      setMessage("หากยังไม่ยืนยันอีเมล ระบบจะส่งลิงก์ให้คุณ");
    } catch (error) { setMessage(error instanceof Error ? error.message : "เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/public/account/sessions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!response.ok) throw Error("ออกจากระบบไม่สำเร็จ กรุณาลองใหม่");
      await load(); setMessage("ออกจากระบบอุปกรณ์ที่เลือกแล้ว");
    } catch (error) { setMessage(error instanceof Error ? error.message : "เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setBusy(false); }
  }
  return <section className={`ui-panel ${styles.panel}`}>
    <h2>ความปลอดภัยของบัญชี</h2>
    {email && <><p>ยืนยันช่องทางติดต่อและจัดการการเข้าถึงบัญชีของคุณ</p>
      <div className={styles.actions}><button className="ui-button" disabled={busy || emailEnabled !== true} onClick={() => void verify()}>ส่งลิงก์ยืนยันอีเมล</button><a className="ui-button ui-button--quiet" href="/account/recovery">ตั้งรหัสผ่านใหม่</a></div>
      {emailEnabled === false && <p className={styles.note}>บริการอีเมลยังไม่เปิดใช้งาน หากต้องการความช่วยเหลือ กรุณาติดต่อทีมงาน</p>}</>}
    <div className={styles.heading}><h3>อุปกรณ์ที่เข้าสู่ระบบ</h3><button className="ui-button ui-button--quiet" disabled={busy || loading} onClick={() => void load().catch(error => setMessage(error.message))}>อัปเดต</button></div>
    {loading && <p role="status">กำลังโหลดอุปกรณ์…</p>}
    {items.map(item => <article key={item.id} className={styles.device}>
      <div className={styles.heading}><strong>{deviceLabel(item.userAgent)}</strong><span>{item.current ? "อุปกรณ์นี้" : "อุปกรณ์อื่น"}</span></div>
      <small>เข้าสู่ระบบ {new Date(item.createdAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</small>
      {!item.current && <button className="ui-button ui-button--quiet" disabled={busy} onClick={() => void revoke(item.id)}>ออกจากระบบอุปกรณ์นี้</button>}
    </article>)}
    {message && <p role="status" className={styles.note}>{message}</p>}
  </section>;
}
