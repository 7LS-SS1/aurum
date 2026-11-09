"use client";
import Link from "next/link";
import { Box, Button, Card, CardActionArea, Chip, Stack, Tab, Tabs, Typography } from "@mui/material";
import { AccountSecurity } from "./AccountSecurity";
import { CustomerInbox } from "./CustomerInbox";
import { OrderRenewal } from "@/components/services/OrderRenewal";
import { ContractSummary } from "@/components/services/ContractSummary";
import { OrderFulfillment } from "@/components/services/OrderFulfillment";
import { OrderArtwork } from "@/components/services/OrderArtwork";
import { OrderRequests } from "@/components/services/OrderRequests";
import { simulationLabel } from "@/lib/ads-simulation";
import { OrderHistory } from "@/components/services/OrderHistory";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { statusLabels } from "@/lib/ads-booking";
import type { ViewerActor } from "@/lib/viewer-auth";
import s from "./AccountDashboard.module.css";
import { MemberOrdersTable, type MemberOrder } from "./MemberOrdersTable";
type Order = MemberOrder;
type View = "overview" | "active" | "pending" | "history" | "profile";
const menus: [View, string, string][] = [["overview", "◈", "Dashboard"], ["active", "▣", "บริการที่เปิดใช้งาน"], ["pending", "◷", "ระหว่างดำเนินการ"], ["history", "≡", "ประวัติคำสั่งซื้อ"], ["profile", "◎", "ตั้งค่าโปรไฟล์"]];
const date = (v: string | null) => v ? new Date(v).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }) : "รอเริ่มสัญญา";
const active = (o: Order) => (o.status === "ACTIVE" && !!o.endsAt && new Date(o.endsAt).getTime() > Date.now()) || o.status === "GRACE";
const pending = (o: Order) => ["REVIEW", "PAYMENT", "PAYMENT_REVIEW", "PAID", "SCHEDULED", "REFUND_REQUIRED"].includes(o.status);
export function MemberOrders({ viewer }: { viewer: ViewerActor }) {
  const router = useRouter();
  const [view, setView] = useState<View>("overview"), [orders, setOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState(true), [message, setMessage] = useState("");
  const [token, setToken] = useState(""), [name, setName] = useState(viewer.displayName), [savedName, setSavedName] = useState(viewer.displayName);
  const [saving, setSaving] = useState(false), [profileMessage, setProfileMessage] = useState("");
  async function load(silent = false) {
    if (!silent) { setBusy(true); setMessage(""); }
    try {
      const all: Order[] = []; let cursor: string | null = null;
      do {
        const response: Response = await fetch("/api/public/account/orders" + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""), { cache: "no-store" });
        if (!response.ok) throw new Error(response.status === 401 ? "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" : "โหลดข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง");
        const result: { orders: Order[]; nextCursor: string | null } = await response.json(); all.push(...result.orders); cursor = result.nextCursor;
      } while (cursor);
      setOrders(all);
    } catch (error) { if(!silent)setMessage((error as Error).message); } finally { if(!silent)setBusy(false); }
  }
  useEffect(() => { void load(); const refresh=()=>{if(document.visibilityState==="visible")void load(true);}; const timer=setInterval(refresh,60000); window.addEventListener("focus",refresh); return()=>{clearInterval(timer);window.removeEventListener("focus",refresh);}; }, []);
  async function claim(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/public/account/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: token.trim() }) });
      if (!response.ok) throw new Error("เชื่อมรายการไม่ได้ กรุณาตรวจรหัส หรือสอบถามทีมงาน");
      setToken(""); await load();
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setProfileMessage("");
    try {
      const response = await fetch("/api/public/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: name.trim() }) });
      if (!response.ok) throw new Error("บันทึกไม่สำเร็จ กรุณาตรวจชื่อหรือเข้าสู่ระบบอีกครั้ง");
      const result = await response.json(); setSavedName(result.displayName); setName(result.displayName); setProfileMessage("บันทึกโปรไฟล์เรียบร้อยแล้ว"); router.refresh();
    } catch (error) { setProfileMessage((error as Error).message); } finally { setSaving(false); }
  }
  const running = orders.filter(active), waiting = orders.filter(pending);
  const ending = running.filter(o => new Date(o.endsAt!).getTime() - Date.now() <= 7 * 86400000);
  const visible = view === "active" ? running : view === "pending" ? waiting : view === "history" ? orders : running.slice(0, 3);
  function cards(items: Order[]) { return items.map(order => {
    return <article className={s.order} key={order.id}><div className={s.row}><span className={active(order) ? s.live : s.badge}>{simulationLabel(order.status, order.simulation) || statusLabels[order.status] || order.status}</span><strong>฿{order.amount.toLocaleString("th-TH")}</strong></div>{(order.simulation || order.promptpay) && <p className={s.muted}>DEMO · รายการทดสอบ ไม่มีการรับเงินจริง</p>}<h3>{order.quote.items.join(" · ")}</h3><p className={s.orderId}>คำสั่งซื้อ #{order.id} · สั่งเมื่อ {date(order.createdAt)}</p><ContractSummary quote={order.quote} startsAt={order.startsAt} endsAt={order.endsAt} days={order.days} status={order.status} />{order.staffNote && <div className={s.note}><small>อัปเดตจากทีมงาน</small><p>{order.staffNote}</p></div>}{order.paymentUrl && <div className={s.row}><span>ชำระภายใน {date(order.holdUntil)}</span><a className={s.primary} href={order.paymentUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">ชำระค่าบริการ ↗</a></div>}{!order.simulation && <Link className={s.secondary} href={`/services/ads-banner/checkout/${order.id}`}>ชำระเงิน / ติดตามคำสั่งซื้อ →</Link>}{order.simulation && <Link className={s.secondary} href={`/services/ads-banner/checkout/${order.id}`}>ชำระเงิน / ติดตามรายการจำลอง →</Link>}<OrderHistory id={order.id} /><OrderRenewal id={order.id} /><OrderFulfillment id={order.id}/><OrderArtwork id={order.id}/><OrderRequests id={order.id} /></article>;
  }); }
  return <main className={s.workspace}><div className={s.content}>
    <Stack direction="row" sx={{ mb: 3, justifyContent:"space-between", alignItems:"center" }}><Chip label="MEMBER WORKSPACE" size="small" variant="outlined" color="primary"/><Button variant="outlined" disabled={busy} onClick={() => load()}>↻ อัปเดตข้อมูล</Button></Stack>
    <Stack direction={{xs:"column", sm:"row"}} spacing={3} sx={{ mb: 4, justifyContent:"space-between", alignItems:{xs:"flex-start",sm:"center"} }}><Box><Typography variant="h1">{view === "overview" ? `สวัสดี ${savedName}` : menus.find(m => m[0] === view)?.[2]}</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>จัดการเว็บไซต์ พื้นที่โฆษณา และติดตามคำสั่งซื้อในที่เดียว</Typography></Box><Button component={Link} variant="contained" href="/services/select">+ สั่งซื้อบริการ</Button></Stack>
    {view === "overview" && <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",sm:"1fr 1fr"},gap:2,mb:3}}>{[["เว็บไซต์ / Website API","ติดตามคำขอสร้างเว็บไซต์และบริการเชื่อมต่อ","/account/website-services"],["การชำระเงิน","ตรวจสอบยอดและประวัติการชำระค่าบริการ","/account/payments"]].map(([title,description,href])=><Card key={href}><CardActionArea component={Link} href={href!} sx={{p:3}}><Typography variant="h3">{title} ↗</Typography><Typography color="text.secondary" variant="body2" sx={{mt:1}}>{description}</Typography></CardActionArea></Card>)}</Box>}
    <Tabs value={view} onChange={(_, value:View)=>setView(value)} variant="scrollable" scrollButtons="auto" aria-label="ส่วนจัดการบัญชี" sx={{borderBottom:1,borderColor:"divider",mb:3}}>{menus.map(([id,,label])=><Tab key={id} value={id} label={label}/>)}</Tabs>
    {view !== "profile" && <>{message && <p role="alert" className={s.error}>{message} <Link href="/login?callbackUrl=%2Faccount">เข้าสู่ระบบ</Link></p>}{busy && <p role="status">กำลังอัปเดตข้อมูลบริการ…</p>}
    {view === "overview" && <><CustomerInbox/><div className={s.stats}>{([["active", "บริการที่เปิดใช้งาน", running.length, "แคมเปญที่กำลังแสดง"], ["pending", "ระหว่างดำเนินการ", waiting.length, "ชำระเงิน / รอติดตั้ง / คืนเงิน"], ["active", "ใกล้ครบสัญญา", ending.length, "ภายใน 7 วันข้างหน้า"], ["history", "คำสั่งซื้อโฆษณา", orders.length, "ตรวจสอบรายการย้อนหลัง"]] as const).map(([target, label, count, hint]) => <button key={label} onClick={() => setView(target)}><span>{label}</span><strong>{busy || message ? "—" : count.toLocaleString("th-TH")}</strong><small>{hint}</small></button>)}</div>{!busy && !message && waiting.length > 0 && <button className={s.notice} onClick={() => setView("pending")}>มี {waiting.length} รายการระหว่างดำเนินการ · ตรวจสอบความคืบหน้า <span>ดูรายการ →</span></button>}<div className={s.sectionHeading}><div><h2>บริการที่เปิดใช้งาน</h2><p>ติดตามระยะเวลาสัญญาและผลการดำเนินงาน</p></div><button className={s.textButton} onClick={() => setView("active")}>ดูทั้งหมด →</button></div></>}
    {!busy && !message && !visible.length && <div className={s.empty}><span aria-hidden="true">▤</span><h2>{view === "history" ? "ยังไม่มีประวัติการใช้บริการ" : view === "pending" ? "ไม่มีรายการระหว่างดำเนินการ" : "ยังไม่มีบริการที่เปิดใช้งาน"}</h2><p>รายการและระยะเวลาสัญญาจะแสดงตามสถานะจริงของคำสั่งซื้อ</p><Link className={s.primary} href="/services/select">เลือกบริการที่เหมาะกับคุณ →</Link></div>}{!busy && !message && visible.length > 0 && <MemberOrdersTable key={view} orders={visible} compact={view === "overview"} renderDetails={order => cards([order])} />}
    {view === "history" && <details className={s.panel}><summary>เชื่อมคำสั่งซื้อที่ทำไว้ก่อนสมัครสมาชิก</summary><form onSubmit={claim}><label>รหัสติดตามคำสั่งซื้อเดิม<input value={token} onChange={e => setToken(e.target.value)} autoComplete="off" pattern="[a-f0-9]{64}" required /></label><p className={s.muted}>ใช้รหัสลับที่ได้รับตอนสั่งซื้อเพื่อยืนยันความเป็นเจ้าของ</p><button className={s.primary} disabled={busy}>เชื่อมคำสั่งซื้อ</button></form></details>}</>}
    {view === "profile" && <div className={s.profileGrid}><AccountSecurity email={viewer.email}/><form className={s.panel} onSubmit={save}><h2>ข้อมูลโปรไฟล์</h2><p className={s.muted}>ชื่อสำหรับแสดงในพื้นที่สมาชิกของคุณ</p><label>ชื่อที่แสดง<input value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={80} required autoComplete="nickname" /></label><label>อีเมลสำหรับเข้าสู่ระบบ<input value={viewer.email || "สมัครสมาชิกด้วยเบอร์โทร"} readOnly /></label><p className={s.muted}>หากต้องการเปลี่ยนอีเมลหรือเบอร์โทร กรุณาติดต่อทีมงานเพื่อยืนยันตัวตน</p>{profileMessage && <p role="status">{profileMessage}</p>}<button className={s.primary} disabled={saving || name.trim() === savedName}>{saving ? "กำลังบันทึก…" : "บันทึกการเปลี่ยนแปลง"}</button></form><section className={s.panel}><h2>บัญชีและการติดต่อ</h2><p className={s.muted}>คำสั่งซื้อเชื่อมกับบัญชีนี้โดยอัตโนมัติ คุณติดตามการชำระเงินและผลการติดตั้งได้จากเมนูบริการ</p><a className={s.secondary} href="https://t.me/thaitubevideo" target="_blank" rel="noopener noreferrer">ติดต่อเจ้าหน้าที่ ↗</a></section></div>}
    <p className={s.footnote}>แสดงคำสั่งซื้อโฆษณาที่เชื่อมกับบัญชีของคุณ · ติดตามคำขอ Website API ได้จากเมนูบริการ Website API</p></div></main>;
}
