"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ContractSummary } from "@/components/services/ContractSummary";
import { OrderArtwork } from "@/components/services/OrderArtwork";
import { OrderRequests } from "@/components/services/OrderRequests";
import { getTransfer } from "@/lib/bank-transfer";
import { actionHelp, actionOptions, orderWorkflow, type AdminAdsOrder, type OrderEvent } from "@/lib/ads-order-workflow";
import { getSimulation, simulationLabel, simulationMethods } from "@/lib/ads-simulation";
import { getPromptPay } from "@/lib/promptpay";
import { getRenewal } from "@/lib/ads-renewal";
import { slotLabel } from "@/lib/ads-order-groups";
import { statusLabels } from "@/lib/ads-booking";
import s from "./AdsOrderDetail.module.css";

type Detail = { order: AdminAdsOrder; events: OrderEvent[]; paymentReady: boolean; promptPayReady: boolean; simulationEnabled: boolean };
const date = (value?: string | null) => value ? new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "ยังไม่มีข้อมูล";
const exceptional = new Set(["reject", "request_refund", "sim_retry", "sim_cancel", "return_installation"]);
const eventTitles: Record<string, string> = {
  assign: "มอบหมายงาน", install: "รับงานติดตั้ง", review_installation: "ส่งตรวจพร้อมหลักฐาน", return_installation: "ส่งกลับแก้ไข", update_progress: "แจ้งความคืบหน้า", ticket_reply: "ข้อความในคำร้อง", artwork_requested: "ขอเปลี่ยน Artwork", artwork_install: "ติดตั้ง Artwork ใหม่",
  contract_transition: "เปลี่ยนรอบสัญญา / ช่วงผ่อนผัน",
  customer_request: "ลูกค้าส่งคำร้อง", notification_resolved: "ดำเนินการแจ้งเตือนแล้ว",
  promptpay_created: "สร้างรายการ PromptPay Sandbox", promptpay_uncertain: "รอตรวจสอบผลสร้าง QR", promptpay_received: "Gateway ยืนยันยอดแล้ว", gateway_confirm: "เจ้าหน้าที่ตรวจรับคำสั่งซื้อ", gateway_close_refund: "ปิดผลทดสอบคืนเงิน Sandbox",
  sim_created: "สร้างคำสั่งซื้อจำลอง", sim_select: "เลือกช่องทางชำระเงิน", sim_submit: "ทดลองชำระเงิน",
  sim_verify: "ตรวจยอดแล้ว", sim_retry: "ส่งกลับให้ชำระใหม่", sim_install: "รับงานติดตั้ง",
  sim_review: "ส่งตรวจผลงาน", sim_activate: "อนุมัติเริ่มบริการ", sim_update: "แจ้งความคืบหน้า",
  sim_cancel: "ยุติรายการจำลอง", approve: "เปิดชำระเงิน", reject: "ไม่อนุมัติคำขอ",
  confirm_payment: "บันทึกยอดเงินเข้า", activate: "อนุมัติเริ่มบริการ", request_refund: "ส่งเข้าคิวคืนเงิน",
  confirm_refund: "ยืนยันคืนเงิน", confirm_removed: "นำป้ายออกและปิดงาน", expired: "ครบกำหนดเวลา",
};

export function AdsOrderDetail({ id, backHref }: { id: string; backHref: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [staff, setStaff] = useState<{id:string;name:string|null}[]>([]);
  useEffect(()=>{void fetch("/api/service-operations").then(r=>r.ok?r.json():null).then(d=>{if(d)setStaff(d.staff);}).catch(()=>{});},[]);
  const [chosen, setChosen] = useState("");
  const [stale, setStale] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/ads-orders/${id}`, { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 404 ? "ไม่พบคำสั่งซื้อนี้" : "โหลดข้อมูลไม่ได้ กรุณาตรวจสิทธิ์แล้วลองใหม่");
      setData(await response.json()); setStale(false); setChosen("");
    } catch (error) { setStale(true); throw error; }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load().catch(error => setMessage(error.message)); }, [load]);

  async function submit(event: React.FormEvent<HTMLFormElement>, order: AdminAdsOrder, action: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setMessage("");
    const body: Record<string, unknown> = { id, revision: order.revision, action, note: String(form.get("note") || "").trim() };
    for (const key of ["paymentUrl", "reference"]) if (form.get(key)) body[key] = String(form.get(key)).trim();
    if (form.get("amount")) body.amount = Number(form.get("amount"));
    if(form.get("dueAt")) body.dueAt = new Date(String(form.get("dueAt"))).toISOString();
    if(form.get("assigneeId")) body.assigneeId = String(form.get("assigneeId"));
    if(action === "review_installation") body.proof = order.slots.map(slot=>({slot,url:String(form.get("proof:"+slot)||"")}));
    try {
      const response = await fetch("/api/ads-orders", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) {
        const errors: Record<string, string> = {
          renewal_pending: "มีรอบต่ออายุรอดำเนินการ กรุณาตรวจสอบรายการต่ออายุก่อนยุติสัญญาเดิม", renewal_change_not_due: "รับชำระและเตรียมงานล่วงหน้าได้ แต่ต้องรอวันเริ่มรอบใหม่ก่อนยืนยันสลับตำแหน่ง", renewal_payment_required: "ยังไม่มีหลักฐานชำระต่ออายุทันกำหนด หรือสัญญาเดิมไม่อยู่ในสถานะที่ต่ออายุได้", renewal_period_elapsed: "เลยวันสิ้นสุดรอบต่ออายุแล้ว โปรดติดต่อผู้ซื้อและตรวจสอบคืนเงิน", renewal_expired: "พ้นกำหนดต่ออายุ 3 วันแล้ว ต้องเปิดสัญญาใหม่",
          installation_review_required: "ต้องติดตั้งและส่งตรวจพร้อมหลักฐานก่อนอนุมัติ", assignment_required: "ต้องกำหนดผู้รับผิดชอบและกำหนดส่งก่อนรับงาน", assignee_or_due_required: "ตรวจผู้รับผิดชอบและกำหนดส่งในอนาคต", installation_proof_required: "แนบหลักฐานให้ครบทุกตำแหน่ง", refund_evidence_required: "ระบุยอดและเลขอ้างอิงการคืนเงิน", revision_conflict: "มีการอัปเดตโดยผู้ใช้อื่นแล้ว โหลดข้อมูลล่าสุดให้แล้ว กรุณาตรวจขั้นตอนอีกครั้ง",
          slots_unavailable: "พื้นที่ถูกจองแล้ว กรุณาตรวจสอบรายการอื่น", simulation_disabled: "ปิดโหมดจำลองอยู่ จึงยังดำเนินการไม่ได้",
          payment_gateway_not_ready: "ยังไม่เปิดรับเงินจริง หรือลิงก์ผู้ให้บริการไม่ถูกต้อง", payment_mismatch: "ยอดเงินหรือเลขอ้างอิงไม่ตรง กรุณาตรวจสอบ",
          invalid_transition: "สถานะเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุด", website_unavailable: "เว็บไซต์นี้ปิดรับจองแล้ว", inventory_changed: "ตำแหน่งโฆษณามีการเปลี่ยนแปลง กรุณาตรวจสอบ",
        };
        if (result.error === "revision_conflict" || result.error === "invalid_transition") await load();
        throw new Error(errors[result.error] || "บันทึกไม่สำเร็จ กรุณาตรวจข้อมูลแล้วลองใหม่");
      }
      try { await load(); setMessage("บันทึกแล้ว · อัปเดตขั้นตอนและประวัติให้ลูกค้าเรียบร้อย"); }
      catch { setMessage("บันทึกแล้ว แต่โหลดข้อมูลล่าสุดไม่ได้ กรุณากดรีเฟรชก่อนดำเนินการต่อ"); }
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }

  const order = data?.order;
  const simulation = order ? getSimulation(order.quote) : null;
  const transfer = order ? getTransfer(order.quote) : null;
  const promptpay = order ? getPromptPay(order.quote) : null;
  const options = order ? actionOptions(order) : [];
  const primary = options.find(([key]) => !exceptional.has(key) && key !== "sim_update" && key !== "update_progress");
  const action = options.some(([key]) => key === chosen) ? chosen : primary?.[0] || "";
  const actionLabel = options.find(([key]) => key === action)?.[1];
  const blocked = stale || busy || loading || Boolean(simulation && !data?.simulationEnabled) || (["approve", "confirm_payment"].includes(action) && !data?.paymentReady);
  const steps = order ? orderWorkflow(order, data!.events) : [];
  const current = steps.find(step => step.state === "current");

  return <div className={s.page}>
    <div className={s.topbar}><Link href={backHref}>← กลับรายการคำสั่งซื้อ</Link><button className="ui-button" disabled={busy || loading} onClick={() => load().catch(error => setMessage(error.message))}>รีเฟรชข้อมูล</button></div>
    {message && <p className={s.notice} role="status">{message}</p>}
    {!order ? <p role="status">{loading ? "กำลังโหลดรายละเอียดคำสั่งซื้อ…" : "ไม่สามารถแสดงรายละเอียดได้ กรุณาลองโหลดข้อมูลใหม่"}</p> : <>
      <header className={s.header}><div><span className={s.eyebrow}>ORDER MANAGEMENT {(simulation || promptpay) && "· DEMO"}</span><h1>รายละเอียดคำสั่งซื้อ</h1>{getTransfer(order.quote)&&<a className="ui-button" href={`/admin/bank-accounts/${getTransfer(order.quote)!.accountId}`}>ตรวจสลิปและบัญชีรับเงิน →</a>}<p className={s.orderId}>{order.id}</p><p>สั่งเมื่อ {date(order.createdAt)} · เวลาประเทศไทย</p></div><div className={s.headerStatus}><span className={s.badge} data-status={order.status}>{simulationLabel(order.status, simulation) || statusLabels[order.status] || order.status}</span><strong>{order.amount.toLocaleString()} <small>บาท</small></strong><span>{order.slots.length} ช่อง · {order.days} วัน</span></div></header>
      {promptpay && <p className={s.demo}><strong>2C2P Sandbox</strong> · ทดสอบเชื่อมต่อ Gateway ไม่มีการรับเงินจริง</p>}
      {simulation && <p className={s.demo}><strong>รายการจำลอง</strong> · ไม่มีการรับเงินจริงหรือส่งคำสั่งติดตั้งไปเว็บไซต์จริง{!data?.simulationEnabled && " · โหมดจำลองปิดอยู่"}</p>}
      <section className={s.panel} aria-label="ขั้นตอนดำเนินงาน"><div className={s.sectionHeading}><div><h2>เส้นทางการดำเนินงาน</h2><p>ดูขั้นตอนที่เสร็จแล้วและงานที่ต้องดำเนินการต่อ</p></div><span>{steps.filter(step => step.state === "done").length} / {steps.length} ขั้นตอนมีหลักฐาน</span></div><ol className={s.steps}>{steps.map((step, index) => <li key={step.title} data-state={step.state} aria-current={step.state === "current" ? "step" : undefined}><span className={s.stepNumber}>{step.state === "done" ? "✓" : String(index + 1).padStart(2, "0")}</span><div><strong>{step.title}</strong><small>{step.state === "done" ? `เสร็จแล้ว · ${date(step.date)}` : step.state === "current" ? "ขั้นตอนปัจจุบัน" : step.state === "unknown" ? "ไม่มีประวัติยืนยันแยกขั้นตอน" : "ยังไม่ดำเนินการ"}</small></div></li>)}</ol></section>
      {!!order.renewals?.length && <section className={s.panel}><h2>สัญญารอบถัดไป</h2>{order.renewals.map(next => <p key={next.id}><Link href={`/admin/ads-orders/${next.id}`}>#{next.id} · {statusLabels[next.status] || next.status} →</Link>{next.status === "ACTIVE" && <span><br/>นำออกเฉพาะ: {order.slots.filter(slot => !next.slots.includes(slot)).map(slotLabel).join(" · ") || "ไม่มีตำแหน่งที่ต้องนำออก"} · คงตำแหน่งที่ต่ออายุไว้</span>}</p>)}</section>}
      {order.renewalOfId && <section className={s.panel}><h2>รายการต่ออายุ · {getRenewal(order.quote)?.mode === "same" ? "คงตำแหน่งเดิม" : "เปลี่ยน / เพิ่มตำแหน่ง"}</h2><Link href={`/admin/ads-orders/${order.renewalOfId}`}>ดูสัญญารอบก่อน #{order.renewalOfId} →</Link><p>ตรวจยอดชำระให้ครบตามกำหนด 3 วัน รอบใหม่เริ่มต่อจากวันสิ้นสุดเดิม การอนุมัติย้อนหลังจะไม่เลื่อนวันเริ่ม</p>{getRenewal(order.quote)?.mode === "change" && <p>เตรียมงานได้ล่วงหน้า แต่ยืนยันสลับตำแหน่งเมื่อถึงวันเริ่มรอบใหม่เท่านั้น นำออกเฉพาะป้ายที่ไม่อยู่ในรายการใหม่</p>}</section>}
      <ContractSummary quote={order.quote} startsAt={order.startsAt} endsAt={order.endsAt} days={order.days} status={order.status} /><div className={s.layout}><div className={s.main}>
        <section className={`${s.panel} ${s.work}`} aria-label="ดำเนินการขั้นตอนปัจจุบัน"><span className={s.eyebrow}>งานของเจ้าหน้าที่</span><h2>{current?.title || statusLabels[order.status] || "ติดตามคำสั่งซื้อ"}</h2><p>{current?.description || "ตรวจสอบรายละเอียดและประวัติการดำเนินงานด้านล่าง"}</p>
          {simulation?.phase === "checkout" && order.status === "PAYMENT" && <p className={s.notice}>รอลูกค้าส่งผลชำระเงินจำลอง จึงจะสามารถตรวจยอดและรับงานได้ · หมดเวลาชำระ {date(order.holdUntil)}</p>}
          {simulation?.receipt && <details className={s.receipt} open={order.status === "PAYMENT"}><summary>หลักฐานธุรกรรมจำลอง · {simulation.receipt.outcome === "success" ? "ยอดตรงกัน" : "ต้องตรวจสอบ"}</summary><dl><div><dt>ช่องทาง</dt><dd>{simulation.method ? simulationMethods[simulation.method] : "ยังไม่เลือก"}</dd></div><div><dt>ยอดคำสั่งซื้อ / ยอดรับจำลอง</dt><dd>{order.amount.toLocaleString()} / {simulation.receipt.amountTHB.toLocaleString()} บาท</dd></div><div><dt>เลขอ้างอิง</dt><dd>{simulation.receipt.id}</dd></div><div><dt>ผลจำลอง</dt><dd>{simulation.receipt.outcome === "success" ? "ยอดตรงกัน" : simulation.receipt.outcome === "mismatch" ? "ยอดไม่ตรง — ส่งกลับให้ชำระใหม่" : "ชำระไม่สำเร็จ"}</dd></div></dl></details>}
          {promptpay && <div className={s.receipt}><strong>QR PromptPay · 2C2P Sandbox</strong><dl><div><dt>เลขใบสั่งชำระ</dt><dd>{promptpay.invoiceNo}</dd></div><div><dt>ยอดที่ตรวจสอบ</dt><dd>{(promptpay.amountSatang / 100).toLocaleString()} บาท</dd></div><div><dt>ผลจาก Gateway</dt><dd>{promptpay.state === "received" ? "ยืนยันยอดสำเร็จ" : "ยังไม่ยืนยันการชำระ"}</dd></div><div><dt>เลขอ้างอิง / เวลาตรวจพบ</dt><dd>{promptpay.reference || "—"}<br/>{date(promptpay.receivedAt)}</dd></div></dl>{["PAYMENT", "EXPIRED"].includes(order.status) && <button className="ui-button" disabled={busy || loading || !data?.promptPayReady} onClick={async () => { setBusy(true); setMessage(""); try { const response = await fetch(`/api/ads-orders/${id}/promptpay/check`, { method: "POST" }); if (!response.ok) throw new Error("ยังตรวจสอบกับ Gateway ไม่สำเร็จ กรุณาตรวจการตั้งค่าหรือข้อมูลธุรกรรม"); const result = await response.json(); await load(); setMessage(result.received ? "Gateway ยืนยันยอดแล้ว กรุณาตรวจรับคำสั่งซื้อ" : "ยังไม่พบผลชำระสำเร็จจาก Gateway"); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } }}>ตรวจยอดจาก Gateway</button>}{!data?.promptPayReady && <p>ยังไม่ได้เปิดการเชื่อมต่อ Sandbox</p>}</div>}
          {transfer && <section className={s.receipt} aria-label="สลิปชำระเงินของลูกค้า">
            <h3>หลักฐานโอนเงินจากลูกค้า</h3>
            {transfer.attachmentId ? <div className={s.slipLayout}>
              <div><a href={`/api/public/ads-attachments?id=${encodeURIComponent(transfer.attachmentId)}&preview=1`} target="_blank" rel="noopener noreferrer">
                {/* Private authenticated attachment: keep original image for receipt inspection. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={s.slipImage} src={`/api/public/ads-attachments?id=${encodeURIComponent(transfer.attachmentId)}&preview=1`} alt="สลิปโอนเงินที่ลูกค้าแนบสำหรับคำสั่งซื้อนี้" />
              </a><div className={s.fileLinks}><a className="ui-button" href={`/api/public/ads-attachments?id=${encodeURIComponent(transfer.attachmentId)}&preview=1`} target="_blank" rel="noopener noreferrer">เปิดสลิปขนาดเต็ม ↗</a><a className="ui-button" href={`/api/public/ads-attachments?id=${encodeURIComponent(transfer.attachmentId)}`}>ดาวน์โหลดสลิป</a></div></div>
              <div><dl><div><dt>ยอดที่ลูกค้าแจ้ง</dt><dd>{transfer.amountSatang !== undefined ? (transfer.amountSatang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 }) + " บาท" : "ยังไม่มีข้อมูล"}</dd></div><div><dt>วันเวลาโอนที่แจ้ง (ประเทศไทย)</dt><dd>{date(transfer.paidAt)}</dd></div><div><dt>ส่งหลักฐานเมื่อ</dt><dd>{date(transfer.submittedAt)}</dd></div><div><dt>สถานะตรวจสอบ</dt><dd>{{ awaiting: "รอแนบสลิป", review: "รอเจ้าหน้าที่ตรวจสอบ", more_info: "ขอข้อมูลเพิ่มเติม", rejected: "ไม่ผ่านการตรวจสอบ", confirmed: "ยืนยันเงินเข้าแล้ว" }[transfer.state]}</dd></div></dl><p className={s.notice}>ตรวจสอบยอดเงินเข้าบัญชีจริงก่อนยืนยัน สลิปที่แนบเพียงอย่างเดียวยังไม่ถือว่าชำระสำเร็จ</p><a className="ui-button" href={`/admin/bank-accounts/${transfer.accountId}`}>ตรวจสอบและจัดการการรับเงิน →</a></div>
            </div> : <p>ลูกค้ายังไม่ได้แนบสลิปสำหรับคำสั่งซื้อนี้</p>}
          </section>}
          {!transfer && !simulation && !promptpay && !data?.paymentReady && <p className={s.notice}>ยังไม่เปิด Gateway จริง จึงไม่สามารถเปิดชำระหรือยืนยันยอดเงินจริงได้</p>}
          {primary && chosen && chosen !== primary[0] && <button className="ui-button" disabled={busy} onClick={() => setChosen("")}>← กลับไปงานขั้นตอนปัจจุบัน</button>}
          {action && <form key={`${order.revision}-${action}`} onSubmit={event => submit(event, order, action)} className={s.actionForm}><fieldset disabled={blocked}><legend>{actionLabel}</legend><p>{order.renewalOfId && ["activate", "sim_activate"].includes(action) ? "ตรวจตำแหน่งและการชำระแล้ว ยืนยันต่ออายุต่อจากวันสิ้นสุดเดิม หากยังไม่ถึงกำหนด ระบบจะรอเริ่มรอบใหม่โดยคงสัญญาเดิมไว้" : action === "confirm_removed" && order.renewals?.some(next => next.status === "ACTIVE") ? "นำออกเฉพาะตำแหน่งที่ไม่อยู่ในสัญญารอบถัดไป ห้ามนำป้ายที่ต่ออายุแล้วออก ตรวจรายการด้านบนก่อนยืนยัน" : actionHelp[action]}</p>
            {action === "approve" && <label>ลิงก์ชำระเงินจากผู้ให้บริการ<input name="paymentUrl" type="url" required placeholder="https://…" maxLength={2000}/></label>}
            {action === "assign" && <><label>พนักงานผู้รับผิดชอบ<select name="assigneeId"><option value="">รับงานเอง</option>{staff.map(p=><option key={p.id} value={p.id}>{p.name||p.id}</option>)}</select></label><label>กำหนดติดตั้งเสร็จ<input type="datetime-local" name="dueAt" required/></label></>}{action === "review_installation" && order.slots.map(slot=><label key={slot}>หลักฐานติดตั้ง {slotLabel(slot)}<input type="url" name={"proof:"+slot} required placeholder="https://"/></label>)}{["confirm_payment", "confirm_refund"].includes(action) && <label>เลขอ้างอิงธุรกรรมจริง<input name="reference" required minLength={3} maxLength={200}/></label>}
            {["confirm_payment", "confirm_refund"].includes(action) && <label>ยอดเงินจริงที่ตรวจสอบแล้ว (บาท)<input name="amount" type="number" required min={0} step={1}/></label>}
            <label>ข้อความแจ้งลูกค้า / บันทึกการดำเนินงาน<textarea name="note" required maxLength={2000} rows={3} placeholder="ระบุผลตรวจสอบ ความคืบหน้า หรือเหตุผลให้ลูกค้าทราบ"/></label><small>ข้อความนี้จะแสดงให้ลูกค้าเห็นในประวัติคำสั่งซื้อ</small>
            {action !== "sim_update" && <label className={s.check}><input type="checkbox" required/>ตรวจสอบข้อมูลครบแล้ว และยืนยัน “{actionLabel}”</label>}
            <button className="ui-button ui-button--primary" type="submit">{busy ? "กำลังบันทึก…" : actionLabel}</button>
          </fieldset></form>}
          {options.some(([key]) => ["sim_update", "update_progress"].includes(key)) && action !== "sim_update" && <button className="ui-button" disabled={busy || loading} onClick={() => setChosen(options.some(([key])=>key==="update_progress") ? "update_progress" : "sim_update")}>เขียนความคืบหน้าให้ลูกค้า</button>}
          {options.some(([key]) => exceptional.has(key)) && <details className={s.exceptions}><summary>ส่งกลับ / ยกเลิก / การดำเนินการอื่น</summary><p>ใช้เมื่อคำสั่งซื้อไม่สามารถดำเนินการตามขั้นตอนปกติได้</p><div>{options.filter(([key]) => exceptional.has(key)).map(([key, label]) => <button key={key} className="ui-button" type="button" disabled={busy || loading} aria-pressed={action === key} onClick={() => setChosen(key)}>{label}</button>)}</div></details>}
          {!transfer && !options.length && <p className={s.notice}>{promptpay && ["PAYMENT", "EXPIRED"].includes(order.status) ? "รอผลตรวจสอบจาก Gateway ก่อนดำเนินการต่อ" : "รายการนี้สิ้นสุดแล้ว สามารถตรวจสอบรายละเอียดและประวัติย้อนหลังได้"}</p>}
        </section>
        <section className={s.panel}><h2>ผู้รับผิดชอบและกำหนดส่ง</h2><p>{order.assignedName || "ยังไม่ได้มอบหมาย"} · {date(order.dueAt)}</p>{order.installationProof?.map(item=><p key={item.slot}>{slotLabel(item.slot)} · <a href={item.url} target="_blank" rel="noopener noreferrer">ดูหลักฐานติดตั้ง ↗</a></p>)}</section><OrderArtwork id={order.id} admin/><OrderRequests id={order.id} admin /><section className={s.panel}><div className={s.sectionHeading}><div><h2>ตำแหน่งและไฟล์โฆษณา</h2><p>ตรวจให้ครบทุกช่องก่อนอนุมัติเริ่มบริการ</p></div><span>{order.slots.length} ช่อง</span></div><div className={s.placements}>{order.slots.map((slot, index) => { const file = order.quote.attachments?.find(item => item.slot === slot); return <article key={slot}><span className={s.eyebrow}>ตำแหน่ง {String(index + 1).padStart(2, "0")}</span><h3>{slotLabel(slot)}</h3><small>{slot}</small>{file ? <><p>{file.name}</p><div className={s.fileLinks}><a className="ui-button" href={`/api/public/ads-attachments?id=${encodeURIComponent(file.fileId)}&preview=1`} target="_blank" rel="noopener noreferrer">ดูตัวอย่าง ↗</a><a className="ui-button" href={`/api/public/ads-attachments?id=${encodeURIComponent(file.fileId)}`}>ดาวน์โหลด</a></div><a href={file.targetUrl} target="_blank" rel="noopener noreferrer">ลิงก์เมื่อคลิกโฆษณา ↗</a><small>{file.targetUrl}</small></> : <p>รายการเดิมไม่มีไฟล์แยกตำแหน่ง</p>}</article>; })}</div>
          <details className={s.exceptions}><summary>ข้อมูลที่บันทึกตอนสั่งซื้อ</summary><ul>{order.quote.items?.map((item, index) => <li key={index}>{item}</li>)}</ul>{order.artworkUrl && <a href={order.artworkUrl} target="_blank" rel="noopener noreferrer">สื่อโฆษณาเดิม ↗</a>}{order.targetUrl && <p><a href={order.targetUrl} target="_blank" rel="noopener noreferrer">ลิงก์ปลายทางเดิม ↗</a></p>}</details>
        </section>
        <section className={s.panel}><h2>ประวัติการดำเนินงาน</h2><p>บันทึกย้อนหลังจากระบบ · รายการเก่าอาจไม่มีประวัติครบทุกขั้นตอน</p><ol className={s.history}><li><span className={s.historyDot}/><div><strong>รับคำสั่งซื้อ</strong><small>{date(order.createdAt)}</small></div></li>{data!.events.map(event => <li key={event.id}><span className={s.historyDot}/><div><strong>{eventTitles[event.action.replace(/^ads_order_/, "")] || statusLabels[event.after || ""] || "อัปเดตคำสั่งซื้อ"}</strong><small>{date(event.date)} · {event.role}</small><p>{event.note}</p>{event.before !== event.after && <small>{statusLabels[event.before || ""] || event.before || "เริ่มรายการ"} → {statusLabels[event.after || ""] || event.after}</small>}{event.reference && <small>อ้างอิง {event.reference}</small>}</div></li>)}</ol></section>
      </div><aside className={s.aside}>
        <section className={s.panel}><span className={s.eyebrow}>CUSTOMER</span><h2>{order.customer.name || "ไม่ได้ระบุชื่อลูกค้า"}</h2><dl><div><dt>อีเมล</dt><dd>{order.customer.email || "ไม่ได้ระบุ"}</dd></div><div><dt>Telegram / เบอร์โทร</dt><dd>{order.customer.contact || "ไม่ได้ระบุ"}</dd></div></dl>{order.note && <div className={s.note}><strong>รายละเอียดจากลูกค้า</strong><p>{order.note}</p></div>}</section>
        <section className={s.panel}><span className={s.eyebrow}>SERVICE DETAILS</span><h2>เว็บไซต์และสัญญา</h2><dl><div><dt>เว็บไซต์ที่ลงโฆษณา</dt><dd>{order.quote.website ? <><strong>{order.quote.website.name}</strong><a href={order.quote.website.url} target="_blank" rel="noopener noreferrer">{order.quote.website.url} ↗</a></> : "รายการเดิมไม่ได้บันทึกเว็บไซต์"}</dd></div><div><dt>ระยะสัญญา</dt><dd>{order.days} วัน · {order.slots.length} ช่อง</dd></div><div><dt>เริ่มสัญญา</dt><dd>{order.startsAt ? date(order.startsAt) : "ยังไม่อนุมัติเริ่มบริการ"}</dd></div><div><dt>สิ้นสุดสัญญา</dt><dd>{date(order.endsAt)}</dd></div><div><dt>กำหนดชำระเงิน</dt><dd>{date(order.holdUntil)}</dd></div>{order.paymentReference && <div><dt>เลขอ้างอิงการชำระ</dt><dd>{order.paymentReference}</dd></div>}</dl><p className={s.note}>{order.renewalOfId ? `รอบต่ออายุ ${order.days} วัน นับต่อจากวันสิ้นสุดเดิม เมื่อชำระทันกำหนดและเจ้าหน้าที่อนุมัติ` : `เริ่มนับ ${order.days} วัน เมื่อเจ้าหน้าที่อนุมัติเริ่มบริการหลังตรวจผลงานแล้ว`}</p></section>
        <section className={s.panel}><h2>อัปเดตล่าสุดถึงลูกค้า</h2><p className={s.note}>{order.staffNote || "ยังไม่มีข้อความจากเจ้าหน้าที่"}</p></section>
      </aside></div>
    </>}
  </div>;
}
