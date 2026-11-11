"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { OrderRenewal } from "@/components/services/OrderRenewal";
import { PaymentSlipHelp } from "./PaymentSlipHelp";
import { ContractSummary } from "./ContractSummary";
import { OrderRequests } from "./OrderRequests";
import { statusLabels } from "@/lib/ads-booking";
import { OrderHistory } from "./OrderHistory";
import s from "./SimulatedCheckout.module.css";

type Order = { id: string; revision: number; status: string; amount: number; days: number; quote: { items: string[] }; staffNote: string; startsAt: string | null; endsAt: string | null; holdUntil: string | null; promptpay: { state: string; environment: string; invoiceNo: string; reference: string | null; receivedAt: string | null; checkoutUrl: string | null } | null };
const date = (value: string | null) => value ? new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "ยังไม่เริ่มสัญญา";
const errors: Record<string, string> = { renewal_expired: "พ้นกำหนดต่ออายุ 3 วันแล้ว กรุณาเปิดสัญญาใหม่", promptpay_not_ready: "ยังไม่เปิดเชื่อมต่อ PromptPay กรุณาติดต่อเจ้าหน้าที่", gateway_unavailable: "ติดต่อผู้ให้บริการไม่ได้ ยังไม่ยืนยันผลการชำระ กรุณาตรวจสอบอีกครั้งภายหลัง", gateway_checkout_unavailable: "ผู้ให้บริการยังไม่ส่งหน้าชำระเงิน กรุณาติดต่อเจ้าหน้าที่เพื่อตรวจสอบรายการเดิม", gateway_payment_mismatch: "ข้อมูลการชำระไม่ตรงกับคำสั่งซื้อ เจ้าหน้าที่ต้องตรวจสอบเพิ่มเติม", slots_unavailable: "พื้นที่ถูกจองแล้ว กรุณาติดต่อเจ้าหน้าที่ก่อนชำระเงิน", rate_limited: "ตรวจสอบบ่อยเกินไป กรุณารอสักครู่", not_found: "ไม่พบคำสั่งซื้อในบัญชีนี้", unauthorized: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" };
export function PromptPayCheckout({ id }: { id: string }) {
  const [order, setOrder] = useState<Order | null>(null), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(`/api/public/payments/promptpay?id=${id}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(errors[result.error] || "โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่");
    setOrder(result.order); setReady(result.ready);
  }, [id]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { load().catch(error => setMessage(error.message)).finally(() => setLoading(false)); }, [load]);
  useEffect(() => {
    // Read our persisted status only. Background polling never creates a charge.
    if (!order || !["PAYMENT", "PAYMENT_REVIEW"].includes(order.status)) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") load().catch(() => {}); }, 15000);
    return () => clearInterval(timer);
  }, [order?.status, load]); // eslint-disable-line react-hooks/exhaustive-deps
  async function act(action: "create" | "check") {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/public/payments/promptpay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
      const result = await response.json();
      if (!response.ok) throw new Error(errors[result.error] || "ยังยืนยันผลไม่ได้ กรุณาติดต่อเจ้าหน้าที่");
      setOrder(result.order); setReady(result.ready);
      if (action === "check") setMessage(result.order.promptpay?.state === "received" ? "ได้รับผลยืนยันจากผู้ให้บริการแล้ว" : "ยังไม่พบผลชำระสำเร็จ กรุณาตรวจสอบอีกครั้งภายหลัง");
    } catch (error) { setMessage((error as Error).message); await load().catch(() => {}); }
    finally { setBusy(false); }
  }
  return <main className={s.page}><Link href="/account">← บัญชีและคำสั่งซื้อของฉัน</Link><header className={s.header}><div><small>ORDER PAYMENT</small><h1>ชำระค่าบริการด้วย QR PromptPay</h1><p>ตรวจยอด เปิด QR ของผู้ให้บริการ แล้วติดตามผลในหน้านี้</p></div></header>
    {message && <p className={s.error} role="status">{message}</p>}
    {!order ? loading ? <p>กำลังโหลดคำสั่งซื้อ…</p> : <button className="ui-button" onClick={() => { setLoading(true); setMessage(""); load().catch(error => setMessage(error.message)).finally(() => setLoading(false)); }}>ลองโหลดอีกครั้ง</button> : <>
      {(order.promptpay || ready) && <div className={s.sandbox}><strong>2C2P Sandbox · ทดสอบการเชื่อมต่อ</strong><span>ยังไม่เปิดรับเงินจริง กรุณาใช้ขั้นตอนทดสอบที่ผู้ให้บริการกำหนด</span></div>}
      <div className={s.layout}><section className={s.panel} aria-label="สถานะการชำระเงิน"><span className={s.badge}>{statusLabels[order.status] || order.status}</span>
        {!ready && !order.promptpay && <><h2>กำลังเตรียมเปิดช่องทาง PromptPay</h2><p>คำสั่งซื้อของคุณถูกบันทึกแล้ว ขณะนี้ยังไม่เปิดรับชำระผ่านช่องทางนี้ กรุณาติดต่อเจ้าหน้าที่เพื่อดำเนินการต่อ</p><a className="ui-button" href="https://t.me/thaitubevideo" target="_blank" rel="noopener noreferrer">ติดต่อเจ้าหน้าที่ ↗</a></>}
        {ready && !order.promptpay && order.status === "REVIEW" && <><h2>QR สำหรับคำสั่งซื้อนี้</h2><p>ยอดและเลขอ้างอิงสร้างจากคำสั่งซื้อ ระบบจะตรวจพื้นที่ว่างก่อนเปิดหน้าชำระเงิน Sandbox</p><button disabled={busy} className="ui-button ui-button--primary" onClick={() => act("create")}>{busy ? "กำลังเตรียมรายการ…" : "เตรียม QR PromptPay (Sandbox)"}</button></>}
        {order.promptpay && ["creating", "unknown"].includes(order.promptpay.state) && <><h2>กำลังตรวจสอบผลสร้างรายการ</h2><p>ยังไม่สามารถยืนยันผลจากผู้ให้บริการได้ กรุณาตรวจสอบรายการเดิมหรือติดต่อเจ้าหน้าที่ ก่อนทำรายการชำระใหม่</p></>}
        {order.promptpay?.checkoutUrl && <><h2>เปิด QR แล้วชำระตามยอดที่ระบุ</h2><p>QR จะแสดงบนหน้าชำระเงินของ 2C2P และมีเวลาหมดอายุของผู้ให้บริการ เมื่อกลับมายังหน้านี้ ระบบจะรอผลตรวจสอบจาก Gateway</p><a className="ui-button ui-button--primary" href={order.promptpay.checkoutUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">เปิด QR PromptPay ที่ 2C2P ↗</a><p className={s.muted}>กันพื้นที่ในระบบถึง {date(order.holdUntil)}</p></>}
        {order.status === "PAYMENT_REVIEW" && <div className={s.result}><span className={s.resultIcon}>✓</span><h2>Gateway ยืนยันยอดแล้ว</h2><p>อยู่ระหว่างเจ้าหน้าที่ตรวจรับคำสั่งซื้อและเตรียมดำเนินงาน ยังไม่เริ่มนับระยะเวลาบริการ</p></div>}
        {["PAID", "ACTIVE", "SCHEDULED", "GRACE", "REMOVAL_REQUIRED", "COMPLETED"].includes(order.status) && <div className={s.result}><span className={s.resultIcon}>✓</span><h2>การสั่งซื้อสำเร็จ</h2><p>{order.status === "PAID" ? "เจ้าหน้าที่ตรวจรับคำสั่งซื้อแล้ว กำลังดำเนินงานตามรายการของคุณ" : "ติดตามรายละเอียดสัญญาและผลการดำเนินงานได้จากบัญชีของคุณ"}</p><Link className="ui-button" href="/account">ติดตามบริการของฉัน →</Link></div>}
        {order.status === "EXPIRED" && <><h2>หมดเวลาที่กันพื้นที่ไว้</h2><p>กรุณาอย่าชำระ QR เดิม หากชำระไปแล้วให้ตรวจสอบสถานะหรือติดต่อเจ้าหน้าที่</p></>}
        {order.status === "REFUND_REQUIRED" && <><h2>เจ้าหน้าที่กำลังตรวจสอบรายการคืนเงิน</h2><p>รายการอยู่ระหว่างตรวจสอบคืนเงิน กรุณาติดตามผลจากเจ้าหน้าที่</p></>}
        {order.promptpay && ["PAYMENT", "EXPIRED"].includes(order.status) && <button className="ui-button" disabled={busy || !ready} onClick={() => act("check")}>{busy ? "กำลังตรวจสอบ…" : "ตรวจสอบการชำระเงินกับ Gateway"}</button>}
        {order.promptpay && <div className={s.receipt}><small>เลขอ้างอิงใบสั่งชำระ</small><code>{order.promptpay.invoiceNo}</code>{order.promptpay.reference && <p>รายการรับชำระ: {order.promptpay.reference}</p>}</div>}
        {order.staffNote && <div className={s.update}><small>อัปเดตจากเจ้าหน้าที่</small><p>{order.staffNote}</p></div>}
        {["REVIEW", "PAYMENT", "PAYMENT_REVIEW", "EXPIRED"].includes(order.status) && <PaymentSlipHelp id={order.id} amount={order.amount} expanded={!ready || !!message || order.status === "EXPIRED"}/> }
        <ContractSummary quote={order.quote} startsAt={order.startsAt} endsAt={order.endsAt} days={order.days} status={order.status} /><OrderHistory key={order.revision} id={id}/><OrderRenewal id={id} /><OrderRequests id={id} />
      </section><aside className={s.panel}><h2>สรุปคำสั่งซื้อ</h2><p className={s.orderId}>{id}</p><ul className={s.items}>{order.quote.items.map((item, index) => <li key={index}>{item}</li>)}</ul><div className={s.total}><span>ยอดชำระทั้งหมด</span><strong>{order.amount.toLocaleString()} บาท</strong></div><dl className={s.info}><div><dt>ระยะเวลา</dt><dd>{order.days} วัน</dd></div><div><dt>เริ่มสัญญา</dt><dd>{date(order.startsAt)}</dd></div><div><dt>สิ้นสุดสัญญา</dt><dd>{date(order.endsAt)}</dd></div></dl><p className={s.muted}>ระยะบริการเริ่มเมื่อเจ้าหน้าที่ติดตั้งและอนุมัติผลงานแล้ว</p></aside></div>
    </>}
  </main>;
}
