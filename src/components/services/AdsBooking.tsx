"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Simulation } from "@/lib/ads-simulation";
import { quoteBooking, statusLabels, type BookingInput } from "@/lib/ads-booking";
import type { AdsPageConfig } from "@/lib/ads-page-config";
import styles from "./AdsBooking.module.css";
import { AdsBookingMap } from "./AdsBookingMap";
import { AdsArtworkFields, type Artwork } from "./AdsArtworkFields";
import { z } from "zod";
import { couponState, couponDate } from "@/lib/coupon-schedule";
import { Alert, Button, Stack, Typography } from "@mui/material";

const draftSchema=z.object({savedAt:z.number(),websiteId:z.string(),kind:z.enum(["slots","homepage","video","everypage","website"]),days:z.union([z.literal(30),z.literal(90),z.literal(180)]),slots:z.array(z.string()).max(72),files:z.record(z.string(),z.object({fileId:z.string().uuid(),name:z.string(),targetUrl:z.string()})),attempt:z.object({requestId:z.string().uuid(),token:z.string().regex(/^[a-f0-9]{64}$/)}).nullable()});

type Order = { simulation: Simulation | null; id: string; status: string; amount: number; days: number; quote: { items: string[] }; staffNote: string; paymentUrl: string | null; holdUntil: string | null; startsAt: string | null; endsAt: string | null };
const date = (value: string | null) => value ? new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "ยังไม่เริ่มนับ";
const errors: Record<string, string> = {
  renewal_expired: "พ้นกำหนดต่ออายุ 3 วันแล้ว กรุณาเปิดสัญญาใหม่", renewal_pending: "มีรายการต่ออายุอยู่แล้ว กรุณาติดตามจากบัญชีของคุณ", renewal_slots_changed: "ตำแหน่งในแพ็กเกจเปลี่ยนไป กรุณาใช้โหมดเปลี่ยนตำแหน่ง", invalid_renewal: "ไม่สามารถต่ออายุรายการนี้ได้ กรุณาตรวจสอบจากบัญชีของคุณ",
  invalid_coupon: "รหัสส่วนลดไม่ถูกต้องหรือหมดอายุ", coupon_limit: "รหัสส่วนลดถูกใช้แล้วหรือครบจำนวนสิทธิ์ กรุณาลบรหัสและตรวจยอดใหม่",
  slots_unavailable: "พื้นที่ถูกจองแล้ว กรุณาโหลดหน้าใหม่เพื่อเลือกช่องอื่น",
  website_unavailable: "เว็บไซต์นี้ยังไม่เปิดรับจอง กรุณาโหลดหน้าใหม่แล้วเลือกเว็บไซต์อีกครั้ง",
  unauthorized: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่ก่อนสั่งซื้อ",
  rate_limited: "ทำรายการบ่อยเกินไป กรุณาลองอีกครั้งภายหลัง", too_many_orders: "มีคำขอจำนวนมาก กรุณาติดต่อทีมงาน",
  request_conflict: "คำขอนี้ถูกส่งแล้ว กรุณาเปิดสถานะคำสั่งซื้อเดิม", not_found: "ไม่พบคำสั่งซื้อ กรุณาตรวจรหัส",
  price_changed: "ราคามีการเปลี่ยนแปลง กรุณาโหลดหน้าใหม่ก่อนยืนยัน",
};
type RenewalSeed = { id: string; mode: "same" | "change"; websiteId: string; slots: string[]; kind: BookingInput["kind"]; days: 30 | 90 | 180; files: (Artwork & { slot: string })[]; name: string; email: string; contact: string; previousEndsAt: string; deadline: string };
export function AdsBooking({ config, simulation = false, renewal }: { renewal?: RenewalSeed; simulation?: boolean; config: Pick<AdsPageConfig, "groups" | "telegram" | "packages" | "inventoryCounts" | "websites" | "coupons"> }) {
  const router = useRouter();
  const [couponCode,setCouponCode]=useState("");
  const [couponNow, setCouponNow] = useState<number | null>(null);
  useEffect(() => { setCouponNow(Date.now()); const timer = setInterval(() => setCouponNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const [websiteId, setWebsiteId] = useState(renewal?.websiteId || "");
  const website = config.websites.find(site => site.id === websiteId);
  const [kind, setKind] = useState<BookingInput["kind"]>(renewal?.mode === "same" ? renewal.kind : "slots");
  const [files,setFiles] = useState<Record<string,Artwork>>(() => Object.fromEntries((renewal?.files || []).map(file => [file.slot, file])));
  const [uploading,setUploading] = useState(false);
  const [uploadError,setUploadError] = useState("");
  const [slots, setSlots] = useState<string[]>(renewal?.slots || []);
  const [step, setStep] = useState(1);

  const [days, setDays] = useState<30 | 90 | 180>(renewal?.days || 30);
  const [occupied, setOccupied] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [token, setToken] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [attempt, setAttempt] = useState<{ requestId: string; token: string } | null>(null);
  const [draftKey,setDraftKey]=useState("");
  const [contact,setContact]=useState({name:renewal?.name||"",email:renewal?.email||"",contact:renewal?.contact||""});
  useEffect(()=>{let cancelled=false;void fetch("/api/public/auth/me",{cache:"no-store"}).then(r=>r.json()).then(data=>{
    if(cancelled||!data.viewer)return;
    if(!renewal)setContact({name:data.viewer.displayName,email:data.viewer.email||"",contact:data.bookingContact||""});
    const key=`ads-draft:${data.viewer.id}:${renewal?.id||"new"}:${renewal?.mode||"new"}`;
    try{const parsed=draftSchema.safeParse(JSON.parse(sessionStorage.getItem(key)||"null"));if(parsed.success&&Date.now()-parsed.data.savedAt<86400000){const d=parsed.data;if(config.websites.some(w=>w.id===d.websiteId)){setWebsiteId(d.websiteId);setKind(d.kind);setDays(d.days);setSlots(d.slots);setFiles(d.files);setAttempt(d.attempt);}}}catch{/* Stored drafts never override server validation. */}setDraftKey(key);
  }).catch(()=>{});return()=>{cancelled=true;};},[renewal,config.websites]);
  useEffect(()=>{if(!draftKey)return;try{sessionStorage.setItem(draftKey,JSON.stringify({savedAt:Date.now(),websiteId,kind,days,slots,files,attempt}));}catch{/* Booking remains available without browser storage. */}},[draftKey,websiteId,kind,days,slots,files,attempt]);
  let quote: ReturnType<typeof quoteBooking> | null = null;
  try { quote = quoteBooking({ kind, slots, days, ...(couponCode?{couponCode}:{}) }, config); } catch { /* no selection yet */ }
  async function loadOrder(secret: string) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/public/ads-orders", { headers: { Authorization: "Bearer " + secret }, cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(errors[result.error] || "โหลดสถานะไม่สำเร็จ กรุณาลองใหม่");
      setOrder(result.order);
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  useEffect(() => {
    try { const saved = sessionStorage.getItem("ads-order-access"); if (saved) setToken(saved); } catch { /* manual entry remains available */ }
  }, []);
  useEffect(() => {
    let cancelled = false;
    setReady(false); setOccupied([]);
    if (!websiteId) return;
    const refresh = () => fetch("/api/public/ads-orders?websiteId=" + encodeURIComponent(websiteId) + (renewal ? "&renewalOfId=" + renewal.id : ""), { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error();
      const result = await response.json(); if (!cancelled) { setOccupied(result.occupied); setReady(true); }
    }).catch(() => { if (!cancelled) { setReady(false); setMessage("เลือกดูราคาและสรุปรายการได้ แต่ขณะนี้ยังยืนยันพื้นที่ไม่ได้ กรุณาติดต่อทีมงานผ่าน Telegram"); } });
    void refresh();
    const timer = setInterval(refresh, 15000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [websiteId, renewal]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quote || !website || uploading) return;
    if (quote.slots.some(slot=>!files[slot]?.fileId)) { setMessage("กรุณาแนบไฟล์ให้ครบทุกช่องที่เลือก"); return; }
    const form = new FormData(event.currentTarget);
    const access = attempt || { requestId: crypto.randomUUID(), token: Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, "0")).join("") };
    setAttempt(access); setBusy(true); setMessage("");
    // Keep the access key before networking so a lost response is recoverable.
    try { sessionStorage.setItem("ads-order-access", access.token); } catch { /* the visible code can still be saved manually */ }
    setToken(access.token);
    try {
      const response = await fetch("/api/public/ads-orders", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + access.token },
        body: JSON.stringify({ ...(renewal ? { renewalOfId: renewal.id, renewalMode: renewal.mode } : {}), websiteId, ...(couponCode?{couponCode}:{}), requestId: access.requestId, kind, slots: kind === "slots" ? slots : [], days, expectedAmount: quote.amount,
          name: form.get("name"), email: form.get("email"), contact: form.get("contact"), artworkUrl: "", targetUrl: files[quote.slots[0]!]!.targetUrl, attachments: quote.slots.map(slot=>({slot,fileId:files[slot]!.fileId,targetUrl:files[slot]!.targetUrl})), note: form.get("note"), acceptedTerms: form.get("acceptedTerms") === "on" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(errors[result.error] || "ส่งคำขอไม่สำเร็จ กรุณาตรวจข้อมูลหรือติดต่อทีมงาน");
      try{if(draftKey)sessionStorage.removeItem(draftKey);}catch{}
      router.push(`/services/ads-banner/checkout/${result.order.id}`);
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  return <div className={styles.root}>
    {renewal && <section className={styles.notice}><h2>{renewal.mode === "same" ? "ต่ออายุ · ตำแหน่งเดิม" : "ต่ออายุ · เปลี่ยน / เพิ่มตำแหน่ง"}</h2><p>อ้างอิงสัญญา #{renewal.id}</p><p>ชำระภายใน {date(renewal.deadline)} · รอบใหม่เริ่ม {date(renewal.previousEndsAt)} ต่อจากวันสิ้นสุดเดิม หลังเจ้าหน้าที่อนุมัติ</p><p>ระบบคำนวณตามราคาปัจจุบันและระยะเวลาที่เลือก ไฟล์เดิมถูกแนบให้แล้ว สามารถเปลี่ยนไฟล์ได้{renewal.mode === "change" ? " · ตำแหน่งใหม่จะเริ่มใช้งานหลังเจ้าหน้าที่ตรวจและสลับป้าย" : ""}</p></section>}
    <h1>เลือกพื้นที่โฆษณาของคุณ</h1>{simulation && <p className={styles.notice}><strong>โหมดจำลอง · ไม่มีการรับเงินจริง</strong><br/>ทดสอบเลือกพื้นที่ ชำระเงินจำลอง และติดตามการติดตั้ง พื้นที่ทดสอบแยกจากคำสั่งซื้อจริง</p>}<p>{simulation ? "เลือกช่อง → สรุปยอด → ชำระเงินจำลอง → ตรวจยอด → ติดตั้งและอนุมัติ" : "เลือกช่อง → ส่งคำขอจอง → รอเปิดชำระเงิน → ตรวจสอบและติดตั้ง"}</p><p>รายการนี้จะเชื่อมกับบัญชีสมาชิกของคุณ · <a href="/account">ดูคำสั่งซื้อของฉัน</a></p>
    <p>{renewal ? "รอบต่ออายุ 30 / 90 / 180 วัน นับต่อจากวันสิ้นสุดเดิม ต้องชำระทันกำหนดและให้เจ้าหน้าที่อนุมัติ" : "ระยะเวลา 30 / 90 / 180 วัน นับจากทีมงานอนุมัติเริ่มแสดงหลังติดตั้ง การส่งคำขอยังไม่ใช่การยืนยันจองช่อง"}</p>
    {message && <p role="status" className={styles.notice}>{message}</p>}
    {!order && <form onSubmit={submit} onChange={() => setAttempt(null)}>
      <fieldset disabled={busy} hidden={step !== 1}>
        <legend>1. เลือกพื้นที่และระยะเวลา</legend>
        <label>เว็บไซต์ที่ต้องการลงโฆษณา<select disabled={!!renewal} required value={websiteId} onChange={e => { setWebsiteId(e.target.value); setSlots([]); setAttempt(null); setMessage(""); }}><option value="">เลือกเว็บไซต์ของเรา</option>{config.websites.map(site => <option key={site.id} value={site.id}>{site.name} · {new URL(site.url).hostname}</option>)}</select></label>
        {!config.websites.length && <p role="status">ยังไม่มีเว็บไซต์เปิดรับจอง กรุณาติดต่อทีมงาน</p>}
        {website && <p>ลงโฆษณาที่ {website.name} · {website.url}{!ready && " · กำลังตรวจสอบพื้นที่"}</p>}
        <div className={styles.grid}><label>รูปแบบ<select disabled={renewal?.mode === "same"} value={kind} onChange={e => { setKind(e.target.value as typeof kind); setAttempt(null); }}><option value="slots">เลือกช่องเอง</option><option value="homepage">เหมาหน้าแรก · 16 ช่อง</option><option value="video">เหมาหน้าวิดีโอ</option><option value="everypage">เหมา Popup และ Fixed ทุกหน้า</option><option value="website">เหมาทั้งเว็บไซต์</option></select></label>
        <label>ระยะเวลา<select value={days} onChange={e => { setDays(Number(e.target.value) as typeof days); setAttempt(null); }}>{[30, 90, 180].map(n => <option key={n} value={n}>{n} วัน</option>)}</select></label></div>
        {website && (renewal?.mode === "same" ? <div><p>ตำแหน่งเดิม · ไม่เปลี่ยนช่องในรอบนี้</p><ul>{quote?.items.map(item => <li key={item}>{item}</li>)}</ul></div> : kind === "slots" ? <AdsBookingMap config={config} selected={slots} occupied={occupied} onToggle={id => { if (renewal?.mode === "same") return; setAttempt(null); setSlots(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]); }} /> : <p>แพ็กเกจรวม {quote?.items.length} ช่อง ระบบจะกันทุกช่องในแพ็กเกจเมื่อเปิดชำระเงิน</p>)}
        {quote?.slots.some(slot => occupied.includes(slot)) && <p role="alert">มีตำแหน่งที่ไม่ว่างในรายการนี้ กรุณาเลือกตำแหน่งใหม่ก่อนดำเนินการ</p>}
        <p>{quote && website ? quote.amount.toLocaleString() + " บาท · " + quote.items.length + " ช่อง" : "กรุณาเลือกเว็บไซต์และช่องโฆษณา"}</p><button type="button" disabled={!quote || !website || !ready || quote.slots.some(slot => occupied.includes(slot))} onClick={() => setStep(2)}>ถัดไป · สรุปคำสั่งซื้อ →</button>
      </fieldset>
      <fieldset disabled={busy} hidden={step !== 2}><legend>2. ข้อมูลติดต่อและสื่อโฆษณา</legend><div className={styles.grid}>
        <label>ชื่อผู้ติดต่อ<input name="name" value={contact.name} onChange={e=>setContact({...contact,name:e.target.value})} required minLength={2} maxLength={120} autoComplete="name" /></label>
        <label>อีเมล (ไม่บังคับสำหรับสมาชิกที่ใช้เบอร์โทร)<input name="email" value={contact.email} onChange={e=>setContact({...contact,email:e.target.value})} type="email" maxLength={200} autoComplete="email" /></label>
        <label>Telegram / เบอร์โทร<input name="contact" value={contact.contact} onChange={e=>setContact({...contact,contact:e.target.value})} required minLength={3} maxLength={200} /></label>
      </div><p>เว็บไซต์ที่ลงโฆษณา: {website?.name} · {website?.url}</p>{quote && <AdsArtworkFields slots={quote.slots} labels={quote.items} files={files} setFiles={setFiles} uploading={uploading} setUploading={setUploading} errors={uploadError} setErrors={setUploadError} />}<label>รายละเอียดเพิ่มเติมสำหรับทีมงาน<textarea name="note" maxLength={2000} rows={3} /></label></fieldset>
      <fieldset disabled={busy} hidden={step !== 2}><legend>3. ตรวจสอบคำขอ</legend><Stack spacing={2} sx={{ my: 2 }}>
          <Typography variant="h6">ส่วนลดที่ใช้ได้กับคำสั่งซื้อนี้</Typography>
          {couponNow !== null && config.coupons.filter(c => couponState(c, couponNow) === "ใช้งานได้").map(c => <Alert key={c.code} severity="info" action={<Button type="button" disabled={busy} onClick={() => { setCouponCode(c.code); setAttempt(null); }}>ใช้โค้ด</Button>}>
            <strong>{c.code} · ลด {c.percent}%</strong><br />ตั้งแต่ {couponDate(c.startsAt)} ถึงก่อน {couponDate(c.endsAt)} (เวลาไทย)<br />จำกัด {c.maxUses.toLocaleString("th-TH")} สิทธิ์ · 1 ครั้งต่อบัญชี · ระบบตรวจจำนวนสิทธิ์อีกครั้งเมื่อส่งคำสั่งซื้อ
          </Alert>)}
          {couponNow !== null && !config.coupons.some(c => couponState(c, couponNow) === "ใช้งานได้") && <Typography>ขณะนี้ไม่มีโค้ดส่วนลดที่อยู่ในช่วงใช้งาน</Typography>}
          {quote?.coupon && <Alert severity="success">ใช้โค้ด {quote.coupon.code} ลด {quote.coupon.percent}% ({quote.discount.toLocaleString("th-TH")} บาท)<br />ยอดก่อนลด {quote.subtotal.toLocaleString("th-TH")} บาท · ยอดหลังลด {quote.amount.toLocaleString("th-TH")} บาท<br />สิ้นสุด {couponDate(quote.coupon.endsAt)} (เวลาไทย)</Alert>}
        </Stack><label>รหัสส่วนลด (ถ้ามี)<input value={couponCode} onChange={e=>{setCouponCode(e.target.value.toUpperCase().trim());setAttempt(null);}} maxLength={30}/></label>{couponCode&&!quote&&<p role="alert">รหัสส่วนลดไม่ถูกต้องหรือหมดอายุ กรุณาลบรหัสเพื่อดูยอดเดิม</p>}{quote&&quote.discount>0&&<p>ยอดก่อนส่วนลด {quote.subtotal.toLocaleString()} บาท · ส่วนลด {quote.discount.toLocaleString()} บาท · ใช้ได้ครั้งเดียวต่อบัญชีและนับสิทธิ์เมื่อส่งคำสั่งซื้อ</p>}
        <p>เว็บไซต์: {website?.name} · {website?.url}</p>
        {quote ? <><p>{quote.items.length} ช่อง · {days} วัน</p><ul>{quote.items.map(item => <li key={item}>{item}</li>)}</ul><strong className={styles.total}>{quote.amount.toLocaleString()} บาท</strong><p>ราคานี้ยังไม่เรียกเก็บเงิน ระยะเวลา 90/180 วันของรายช่องและเหมาหน้าแรกคิดตามสัดส่วน ไม่มีส่วนลดเหมาทั้งเว็บไซต์</p></> : <p>กรุณาเลือกอย่างน้อยหนึ่งช่อง</p>}
        <label className={styles.check}><input name="acceptedTerms" type="checkbox" required /> ยอมรับราคาและระยะเวลาตามคำสั่งซื้อ เจ้าหน้าที่ตรวจสื่อหลังชำระเงิน หากไม่ผ่านต้องดำเนินการคืนเงินก่อนยุติรายการ {renewal ? "และนับรอบต่ออายุจากวันสิ้นสุดสัญญาเดิมเมื่อเจ้าหน้าที่อนุมัติ" : "และเริ่มนับอายุเมื่ออนุมัติเริ่มแสดง"}</label>
        <button type="button" disabled={uploading} onClick={() => setStep(1)}>← แก้ไขรายการ</button><button type="submit" disabled={!quote || busy || !ready || uploading || quote.slots.some(slot => occupied.includes(slot)) || quote.slots.some(slot=>!files[slot]?.fileId)}>{busy ? "กำลังส่ง…" : simulation ? "ยืนยัน → ชำระเงินจำลอง" : "ยืนยันและส่งคำขอจอง"}</button>
      </fieldset>
    </form>}
    <section className={styles.tracking}><h2>ติดตามคำสั่งซื้อ</h2><p>รหัสนี้ใช้เข้าถึงรายการและลิงก์ชำระเงิน เก็บเป็นความลับ ระบบจดจำเฉพาะแท็บนี้</p><label>รหัสติดตาม<input value={token} onChange={e => setToken(e.target.value.trim())} autoComplete="off" spellCheck={false} /></label><button type="button" disabled={busy || !/^[a-f0-9]{64}$/.test(token)} onClick={() => loadOrder(token)}>ดู / อัปเดตสถานะ</button>
      {order && <article><h3>{statusLabels[order.status] || order.status}</h3><p>หมายเลข {order.id}</p><p>{order.amount.toLocaleString()} บาท · {order.days} วัน</p><ul>{order.quote.items.map(item => <li key={item}>{item}</li>)}</ul>
        <p>เริ่ม: {date(order.startsAt)}<br />สิ้นสุด: {date(order.endsAt)}</p>{order.staffNote && <p>ข้อความจากทีมงาน: {order.staffNote}</p>}
        {order.paymentUrl && <><p>ชำระภายใน {date(order.holdUntil)} หากหมดเวลาให้ติดต่อทีมงานก่อนชำระ</p><a href={order.paymentUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className={styles.pay}>ไปชำระเงินกับผู้ให้บริการ ↗</a></>}
        {order.simulation && <a className={styles.pay} href={`/services/ads-banner/checkout/${order.id}`}>เปิดหน้าชำระเงินและติดตามรายการจำลอง →</a>}
        {order.status === "REVIEW" && <p>คำขออยู่ระหว่างรอเจ้าหน้าที่ตรวจสอบ รายการนี้ยังไม่หักเงินและยังไม่กันพื้นที่ ลิงก์ชำระเงินจะแสดงเมื่อเจ้าหน้าที่เปิดชำระ</p>}
      </article>}
    </section>
  </div>;
}
