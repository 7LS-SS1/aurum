"use client";

import Link from "next/link";
import { OrderRenewal } from "@/components/services/OrderRenewal";
import { ContractSummary } from "./ContractSummary";
import { OrderRequests } from "./OrderRequests";
import { useCallback, useEffect, useState } from "react";
import { simulationLabel, simulationMethods, type SimulationOrder } from "@/lib/ads-simulation";
import { getRenewal } from "@/lib/ads-renewal";
import { statusLabels } from "@/lib/ads-booking";
import { OrderHistory } from "./OrderHistory";
import s from "./SimulatedCheckout.module.css";

const date = (value: string | null) => value ? new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "ยังไม่เริ่มสัญญา";
const messages: Record<string, string> = { revision_conflict: "สถานะเปลี่ยนแล้ว กรุณาอัปเดตข้อมูลก่อนลองใหม่", invalid_transition: "รายการหมดเวลาหรือเปลี่ยนสถานะแล้ว กรุณาอัปเดตข้อมูล", simulation_disabled: "โหมดจำลองปิดอยู่", not_found: "ไม่พบรายการทดสอบในบัญชีนี้", unauthorized: "กรุณาเข้าสู่ระบบด้วยบัญชีที่สั่งซื้อ", rate_limited: "ทำรายการบ่อยเกินไป กรุณารอสักครู่" };

export function SimulatedCheckout({ id }: { id: string }) {
  const [order, setOrder] = useState<SimulationOrder | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const polling = !!order && ["PAYMENT", "PAID"].includes(order.status);
  const accept = useCallback((next: SimulationOrder) => setOrder(current => !current || next.revision >= current.revision ? next : current), []);
  const load = useCallback(async () => {
    const response = await fetch(`/api/public/ads-orders/simulation?id=${id}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw Error(messages[result.error] || "โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่");
    accept(result.order); setError("");
  }, [id, accept]);
  useEffect(() => { void load().catch(e => setError(e.message)); }, [load]);
  useEffect(() => {
    if (!polling) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => { if (stopped) return; try { await load(); } catch (e) { if (!stopped) setError((e as Error).message); } if (!stopped) timer = setTimeout(poll, 5000); };
    timer = setTimeout(poll, 5000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [load, polling]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  async function act(body: Record<string, string>) {
    if (!order || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/public/ads-orders/simulation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, revision: order.revision, ...body }) });
      const result = await response.json();
      if (!response.ok) throw Error(messages[result.error] || "ทำรายการจำลองไม่สำเร็จ");
      accept(result.order);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const sim = order?.simulation;
  const seconds = Math.max(0, Math.ceil(((order?.holdUntil ? new Date(order.holdUntil).getTime() : now) - now) / 1000));
  const checkout = order?.status === "PAYMENT" && sim?.phase === "checkout";
  const step = ["ACTIVE", "SCHEDULED", "GRACE"].includes(order?.status || "") ? 4 : sim?.phase === "approval" || sim?.phase === "installing" ? 3 : order?.status === "PAID" ? 2 : sim?.phase === "submitted" ? 1 : 0;
  return <main className={s.page}>
    <Link href="/account">← บัญชีและคำสั่งซื้อของฉัน</Link>
    <div className={s.sandbox}><strong>DEMO · ระบบชำระเงินจำลอง</strong><span>ไม่มีการเรียกเก็บเงิน ห้ามโอนเงินจริง · QR และช่องทาง USDT ใช้แสดงตัวอย่างเท่านั้น</span></div>
    <header className={s.header}><div><small>AURUM CHECKOUT</small><h1>{["PAID", "ACTIVE", "SCHEDULED", "GRACE"].includes(order?.status || "") ? "รับคำสั่งซื้อจำลองเรียบร้อย" : "ชำระค่าบริการจำลอง"}</h1><p>เลือกช่องทาง ทดลองชำระ และติดตามงานของคุณในหน้าเดียว</p></div><button className="ui-button" disabled={busy} onClick={() => load().catch(e => setError(e.message))}>อัปเดตสถานะ</button></header>
    {error && <p role="alert" className={s.error}>{error}</p>}
    {!order && !error && <p role="status">กำลังโหลดคำสั่งซื้อ…</p>}
    {order && sim && <>
      <ol className={s.steps} aria-label="ขั้นตอนคำสั่งซื้อ">{["เลือกช่องทาง", "ตรวจยอด", "รับคำสั่งซื้อ", "ดำเนินงาน", "เริ่มบริการ"].map((label, index) => <li key={label} data-current={index === step} data-done={index < step} aria-current={index === step ? "step" : undefined}><span>{index < step ? "✓" : index + 1}</span>{label}</li>)}</ol>
      <div className={s.layout}><section className={s.panel}>
        <span className={s.badge}>{simulationLabel(order.status, sim) || statusLabels[order.status]}</span>
        {checkout ? <>
          <h2>เลือกช่องทางชำระเงิน</h2><p className={s.muted}>ยอดทั้งหมด {order.amount.toLocaleString("th-TH")} บาท · สำหรับทดสอบเท่านั้น</p>
          <div className={s.methods}>{Object.entries(simulationMethods).map(([method, label]) => <button key={method} type="button" disabled={busy || seconds === 0} aria-pressed={sim.method === method} onClick={() => act({ action: "select", method })}><span aria-hidden="true">{method === "qr" ? "▦" : "₮"}</span><strong>{label}</strong><small>{method === "qr" ? "ตัวอย่าง QR ไม่มีข้อมูลรับเงิน" : method === "usdt_bep20" ? "BNB Smart Chain · ชื่อรอยืนยัน" : "TRON"}</small></button>)}</div>
          {sim.method && <div className={s.payment}>
            {sim.method === "qr" ? <div className={s.qrMock} role="img" aria-label="กรอบตัวอย่าง QR จำลอง สแกนชำระไม่ได้"><span aria-hidden="true">▦</span><strong>DEMO QR</strong><small>สแกนชำระไม่ได้</small></div> : <div className={s.wallet}><span aria-hidden="true">₮</span><strong>{(Math.ceil(order.amount / sim.rateTHB * 1e6) / 1e6).toFixed(6)} USDT</strong><p>อัตราสมมติ 1 USDT = {sim.rateTHB} บาท<br/>ไม่ใช่อัตราตลาดหรือข้อเสนอรับเงินจริง</p><div>ไม่มี Wallet รับเงินในโหมดจำลอง</div></div>}
            <div><h3>{simulationMethods[sim.method]}</h3><p>กดปุ่มด้านล่างเพื่อสร้างธุรกรรมทดสอบ จากนั้นเจ้าหน้าที่จะตรวจสอบในหลังบ้าน</p><button className="ui-button ui-button--primary" disabled={busy || seconds === 0} onClick={() => act({ action: "submit", outcome: "success" })}>{busy ? "กำลังดำเนินการ…" : "จำลองชำระสำเร็จ → ส่งตรวจยอด"}</button></div>
          </div>}
          {sim.receipt?.outcome === "failed" && <p role="status" className={s.error}>จำลองการชำระไม่สำเร็จ ยังไม่มีการส่งตรวจยอด สามารถลองอีกครั้งได้</p>}
          {sim.method && <details className={s.scenarios}><summary>ทดสอบกรณีผิดปกติ</summary><p>ใช้ตรวจการรับมือของระบบ โดยไม่มีธุรกรรมเงินจริง</p><button className="ui-button" disabled={busy || seconds === 0} onClick={() => act({ action: "submit", outcome: "failed" })}>จำลองชำระไม่สำเร็จ</button><button className="ui-button" disabled={busy || seconds === 0} onClick={() => act({ action: "submit", outcome: "mismatch" })}>จำลองยอดไม่ตรง</button></details>}
        </> : <div className={s.result}><span className={s.resultIcon} aria-hidden="true">{["ACTIVE", "PAID", "SCHEDULED", "GRACE"].includes(order.status) ? "✓" : "◷"}</span><h2>{simulationLabel(order.status, sim) || statusLabels[order.status]}</h2><p>{order.status === "PAYMENT" ? "ส่งธุรกรรมจำลองแล้ว รอเจ้าหน้าที่ตรวจสอบยอดในระบบ หน้านี้จะอัปเดตสถานะอัตโนมัติ" : order.status === "PAID" ? "เจ้าหน้าที่ยืนยันการชำระเงินจำลองแล้ว เราได้รับคำสั่งซื้อและกำลังดำเนินงาน ระยะเวลาบริการยังไม่เริ่มนับ" : order.status === "ACTIVE" ? "อนุมัติผลงานจำลองแล้ว เริ่มนับระยะเวลาตามวันที่ด้านล่าง ไม่มีการติดตั้งป้ายบนเว็บไซต์จริง" : order.status === "SCHEDULED" ? "อนุมัติต่ออายุล่วงหน้าแล้ว ระบบจะเริ่มรอบใหม่ต่อจากวันสิ้นสุดเดิม" : order.status === "GRACE" ? "อยู่ในช่วงต่ออายุ 3 วัน ยังคงแสดงป้าย โปรดทำรายการและชำระให้ทันกำหนด" : "รายการนี้ไม่เปิดรับการชำระจำลองแล้ว สามารถกลับไปเลือกพื้นที่เพื่อสร้างรายการใหม่"}</p><Link className="ui-button" href="/account">ติดตามในบัญชีของฉัน →</Link></div>}
        {order.staffNote && <div className={s.update}><small>อัปเดตล่าสุดจากเจ้าหน้าที่</small><p>{order.staffNote}</p></div>}
        <ContractSummary quote={order.quote} startsAt={order.startsAt} endsAt={order.endsAt} days={order.days} status={order.status} /><OrderHistory key={order.revision} id={order.id} /><OrderRenewal id={order.id} /><OrderRequests id={order.id} />
      </section><aside className={s.panel}><h2>สรุปคำสั่งซื้อ</h2><code className={s.orderId}>{order.id}</code><ul className={s.items}>{order.quote.items.map((item, index) => <li key={index}>{item}</li>)}</ul><div className={s.total}><span>ยอดจำลอง</span><strong>฿{order.amount.toLocaleString("th-TH")}</strong></div><dl className={s.info}><div><dt>ระยะเวลา</dt><dd>{order.days} วัน</dd></div><div><dt>เริ่มสัญญา</dt><dd>{date(order.startsAt)}</dd></div><div><dt>สิ้นสุดสัญญา</dt><dd>{date(order.endsAt)}</dd></div></dl>{order.status === "PAYMENT" && <div className={s.timer}><strong>{seconds > 0 ? `เหลือ ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} นาที` : "หมดเวลากันพื้นที่ทดสอบ"}</strong><p>กันพื้นที่ทดสอบถึง {date(order.holdUntil)} เมื่อส่งผลสำเร็จทันเวลา สามารถรอเจ้าหน้าที่ตรวจยอดภายหลังได้</p></div>}{sim.receipt && <div className={s.receipt}><small>เลขอ้างอิงจำลอง</small><code>{sim.receipt.id}</code></div>}<p className={s.muted}>{getRenewal(order.quote) ? "รอบต่ออายุนับต่อจากวันสิ้นสุดเดิม เมื่อชำระทันกำหนดและเจ้าหน้าที่อนุมัติ" : "วันเริ่มสัญญาจะถูกบันทึกเมื่อเจ้าหน้าที่อนุมัติผลงานเท่านั้น"}</p></aside></div>
    </>}
  </main>;
}
