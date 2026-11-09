"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./StripeBilling.module.css";

type Order = { id: string; kind: string; title: string; amountSatang: number; mode: string; status: string; url: string | null; bannerOrderId: string | null; bannerStatus: string | null; createdAt: string; lastCheckedAt: string | null; paidAt: string | null };
const statuses: Record<string, string> = { DRAFT: "รอสร้างลิงก์", CREATING: "กำลังเตรียม / รอตรวจใบแจ้งหนี้", OPEN: "รอชำระ", PAID: "ชำระเงินเรียบร้อย", REVIEW: "ต้องตรวจสอบ", EXPIRED: "หมดเวลา", VOID: "ยกเลิก", REFUNDED: "คืนเงินแล้ว" };
const errors: Record<string, string> = {
  stripe_disabled: "ยังไม่เปิดระบบ Stripe Sandbox", stripe_test_database_required: "ต้องเชื่อมฐานข้อมูลทดสอบก่อนเปิด Stripe Sandbox",
  stripe_request_failed_check_existing_payment: "ยังยืนยันผลจาก Stripe ไม่ได้ ให้ตรวจสถานะหรือลองดำเนินการรายการเดิมอีกครั้ง",
  stripe_creation_needs_reconciliation: "รายการนี้ต้องตรวจสอบใน Stripe ก่อน ห้ามสร้างรายการชำระซ้ำ",
  stripe_settlement_time_unavailable: "ยืนยันเวลาชำระจาก Stripe ยังไม่ได้ กรุณาให้ทีมงานตรวจรายการเดิมก่อน",
  stripe_expiry_needs_reconciliation: "ยังยืนยันการปิดช่องทางชำระไม่ได้ ระบบจะตรวจซ้ำและคงพื้นที่จองไว้",
  stripe_refund_not_complete: "Stripe ยังไม่ยืนยันการคืนเงินครบจำนวน",
  banner_payment_conflict: "คำสั่งซื้อ Banner นี้มีช่องทางชำระแล้ว หรือไม่อยู่ในสถานะรอตรวจสอบ",
  stripe_verification_required: "ยังยืนยันยอดชำระไม่ได้ กรุณาตรวจสถานะก่อน", customer_email_required: "ไม่พบสมาชิกที่ใช้งานได้พร้อมอีเมล",
  request_conflict: "ข้อมูลไม่ตรงกับคำขอเดิม กรุณาตรวจรายการที่สร้างไว้ก่อน", slots_unavailable: "ตำแหน่ง Banner ถูกจองแล้ว",
  not_found: "ไม่พบคำสั่งซื้อในบัญชีนี้", invalid_return_order: "เลขคำสั่งซื้อที่กลับจากหน้าชำระเงินไม่ถูกต้อง",
  rate_limited: "ดำเนินการถี่เกินไป กรุณารอสักครู่", invalid_transition: "สถานะรายการเปลี่ยนแล้ว กรุณาโหลดรายการใหม่",
};
export function StripeBilling({ admin = false }: { admin?: boolean }) {
  const endpoint = admin ? "/api/stripe-orders" : "/api/public/payments/stripe";
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const [enabled, setEnabled] = useState(false), [kind, setKind] = useState("VIDEO");
  const [checkingReturn, setCheckingReturn] = useState(false);
  const requestId = useRef("");
  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "load_failed");
    setOrders(data.orders); setEnabled(data.enabled);
    return data.orders as Order[];
  }, [endpoint]);
  function showError(e: unknown) { const key = e instanceof Error ? e.message : "unknown"; setError(errors[key] || `ดำเนินการไม่สำเร็จ (${key})`); }
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function initialize() {
      const rows = await load();
      if (cancelled) return;
      setLoading(false);
      const params = new URLSearchParams(window.location.search);
      if (admin || params.get("result") !== "returned") return;
      const id = params.get("order_id");
      if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error("invalid_return_order");
      // Older Checkout links had no order ID. Check only a bounded set of existing open sessions.
      const ids = id ? [id] : rows.filter(row => row.mode === "CHECKOUT" && ["OPEN", "CREATING"].includes(row.status)).slice(0, 3).map(row => row.id);
      if (!ids.length) return;
      setCheckingReturn(true);
      let confirmed = false;
      for (const orderId of ids) {
        if (cancelled) return;
        const response = await fetch(endpoint, { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: orderId, action: "check" }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "load_failed");
        if (cancelled) return;
        confirmed ||= data.order.status === "PAID";
        // Only a server-verified, persisted order may become paid in the UI.
        setOrders(previous => previous.some(row => row.id === data.order.id) ? previous.map(row => row.id === data.order.id ? data.order : row) : [data.order, ...previous]);
      }
      if (!cancelled) setMessage(confirmed ? "ชำระเงินเรียบร้อย · บันทึกคำสั่งซื้อแล้ว" : "");
    }
    initialize().catch(e => { if (!cancelled) showError(e); }).finally(() => { if (!cancelled) { setLoading(false); setCheckingReturn(false); } });
    return () => { cancelled = true; controller.abort(); };
  }, [load, endpoint, admin]);
  // Poll the persisted ledger. The return check and signed webhook reconcile with Stripe.
  useEffect(() => { const timer = setInterval(() => { if (!document.hidden) load().catch(() => {}); }, 15000); return () => clearInterval(timer); }, [load]);
  async function action(order: Order, action: string) {
    if (action === "close_refund" && !window.confirm("ยืนยันว่าตรวจนำป้ายออกครบทุกตำแหน่งแล้ว? ระบบจะตรวจยอดคืนกับ Stripe อีกครั้งก่อนปิดงานและคืนพื้นที่")) return;
    setBusy(order.id); setError(""); setMessage("");
    try {
      const response = await fetch(endpoint, { method: admin ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: order.id, action, ...(action === "close_refund" ? { removalConfirmed: true } : {}) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      await load(); setMessage(action === "confirm_banner" ? "ตรวจรับการชำระแล้ว ดำเนินงานติดตั้งต่อได้ในคำสั่งซื้อ Banner" : data.order?.status === "PAID" ? "ชำระเงินเรียบร้อย · บันทึกคำสั่งซื้อแล้ว" : "อัปเดตสถานะแล้ว");
    } catch (e) { showError(e); } finally { setBusy(null); }
  }
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget, values = new FormData(form);
    if (!requestId.current) requestId.current = crypto.randomUUID();
    const payload = kind === "VIDEO" ? { kind, viewerId: String(values.get("viewerId")).trim(), title: String(values.get("title")).trim(), amountSatang: Math.round(Number(values.get("amount")) * 100) } : { kind, bannerOrderId: String(values.get("bannerOrderId")).trim() };
    setBusy("create"); setError(""); setMessage("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, mode: values.get("mode"), requestId: requestId.current }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      requestId.current = ""; form.reset(); await load(); setMessage("บันทึกฉบับร่างแล้ว ตรวจสอบข้อมูลก่อนสร้างลิงก์ชำระเงิน");
    } catch (e) { showError(e); } finally { setBusy(null); }
  }
  return <section className={styles.root}>
    <header className={styles.heading}><div><span className={styles.eyebrow}>AURUM / PAYMENTS</span><h1>{admin ? "การชำระเงินและใบแจ้งหนี้" : "รายการชำระเงินของฉัน"}</h1><p>บริการวิดีโอและ Banner · ชำระครั้งเดียว · สกุลเงินบาท</p></div><button disabled={!!busy} onClick={() => { setError(""); load().catch(showError); }}>โหลดรายการใหม่</button></header>
    <div className={styles.notice}><strong>Sandbox — สำหรับทดสอบเท่านั้น</strong><p>ไม่มีการเรียกเก็บเงินจริง {enabled ? "ระบบทดสอบเปิดใช้งานแล้ว" : "ระบบสร้างรายการยังปิดอยู่"}</p></div>
    {checkingReturn && <p role="status" className={styles.notice}>กำลังยืนยันการชำระเงินกับ Stripe…</p>}
    {error && <div role="alert" className={styles.error}>{error}</div>}
    {message && <p role="status" className={styles.message}>{message}</p>}
    {admin && <form className={styles.form} onSubmit={create}>
      <h2>สร้างรายการชำระเงิน</h2><p>ใช้ราคาและขอบเขตบริการที่ตกลงกับลูกค้าแล้ว รายการ Banner จะใช้ยอดจากคำสั่งซื้อโดยตรง</p>
      <div className={styles.fields}><label>บริการ<select value={kind} onChange={e => setKind(e.target.value)} disabled={!!busy}><option value="VIDEO">บริการวิดีโอ</option><option value="BANNER">Banner</option></select></label>
      <label>รูปแบบ<select name="mode"><option value="CHECKOUT">ลิงก์ชำระเงิน Checkout</option><option value="INVOICE">ใบแจ้งหนี้ Invoice</option></select></label>
      {kind === "VIDEO" ? <><label>รหัสสมาชิก<input name="viewerId" required placeholder="รหัสจากหน้าสมาชิก" /></label><label>ชื่อบริการ<input name="title" required minLength={3} maxLength={200} /></label><label>ยอดรวม (บาท)<input name="amount" type="number" min="10" max="999999.99" step="0.01" required /></label></> : <label>รหัสคำสั่งซื้อ Banner<input name="bannerOrderId" required placeholder="คำสั่งซื้อสถานะรอตรวจสอบ" /></label>}</div>
      <button className={styles.primary} disabled={!!busy || !enabled}>{busy === "create" ? "กำลังบันทึก…" : "บันทึกฉบับร่าง"}</button>
    </form>}
    <div className={styles.list}><h2>ประวัติคำสั่งซื้อและการชำระเงิน <span>{orders.length}</span></h2>
      {loading ? <p role="status">กำลังโหลดรายการ…</p> : !orders.length ? <p className={styles.empty}>ยังไม่มีรายการชำระเงิน</p> : orders.map(order => <article key={order.id} id={`order-${order.id}`} className={`${styles.card} ${order.status === "PAID" ? styles.paidCard : ""}`}>
        <div><span className={styles.tag}>{order.kind} · {order.mode === "INVOICE" ? "ใบแจ้งหนี้" : "Checkout"}</span><h3>{order.title}</h3><p className={styles.id}>เลขคำสั่งซื้อ #{order.id}</p><span className={order.status === "PAID" ? styles.paidBadge : undefined}>{order.status === "PAID" && "✓ "}{statuses[order.status] || order.status}</span></div>
        <div className={styles.total}>{new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(order.amountSatang / 100)}<small>{new Date(order.createdAt).toLocaleDateString("th-TH")}</small></div>
        {order.status === "PAID" && <div className={styles.receipt}>
          <strong>บันทึกคำสั่งซื้อเรียบร้อยแล้ว</strong>
          <span>{order.paidAt ? `ยืนยันการชำระเงินเมื่อ ${new Date(order.paidAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}` : "ยืนยันการชำระเงินแล้ว"}</span>
          <p>คุณสามารถกลับมาตรวจสอบรายการนี้ได้ในประวัติคำสั่งซื้อ{order.kind === "BANNER" ? " · ทีมงานจะตรวจรับยอดและดำเนินการติดตั้งตามขั้นตอน" : ""}</p>
          {order.bannerOrderId && <Link href={admin ? `/admin/ads-orders/${order.bannerOrderId}` : `/account/orders/${order.bannerOrderId}/summary`}>ดูรายละเอียดคำสั่งซื้อ Banner →</Link>}
        </div>}
        <div className={styles.actions}>
          {["DRAFT", "CREATING"].includes(order.status) && (admin || order.mode === "CHECKOUT") && <button disabled={!!busy || !enabled} onClick={() => action(order, "prepare")}>{order.status === "DRAFT" ? "สร้างลิงก์ / เตรียมใบแจ้งหนี้" : "ดำเนินรายการเดิมต่อ"}</button>}
          {admin && order.mode === "INVOICE" && order.status === "CREATING" && <button disabled={!!busy || !enabled} onClick={() => action(order, "finalize")}>ยืนยันออกใบแจ้งหนี้</button>}
          {order.url && <a className={styles.pay} href={order.url} target="_blank" rel="noopener noreferrer">{order.mode === "INVOICE" ? "เปิดใบแจ้งหนี้" : "เปิดหน้าชำระเงิน"} ↗</a>}
          {!['DRAFT','VOID','EXPIRED'].includes(order.status) && <button disabled={!!busy} onClick={() => action(order, "check")}>{busy === order.id ? "กำลังตรวจสอบ…" : "ตรวจสถานะกับ Stripe"}</button>}
          {admin && order.kind === "BANNER" && order.status === "PAID" && order.bannerStatus === "PAYMENT_REVIEW" && <button disabled={!!busy} onClick={() => action(order, "confirm_banner")}>ตรวจรับยอด Banner</button>}
          {admin && order.bannerOrderId && order.status === "REFUNDED" && order.bannerStatus === "REFUND_REQUIRED" && <button disabled={!!busy} onClick={() => action(order, "close_refund")}>นำป้ายออกแล้ว · ปิดงานคืนเงิน</button>}
          {order.status === "REFUNDED" && order.bannerStatus === "REFUNDED" && <span>ปิดงานคืนเงินและคืนพื้นที่แล้ว</span>}
          {admin && order.bannerOrderId && <Link href="/admin/ads-orders">ดูคำสั่งซื้อ Banner</Link>}
        </div>
        {order.status === "REVIEW" && <p className={styles.warning}>รายการนี้ต้องให้ทีมงานตรวจสอบยอด การคืนเงิน หรือสิทธิ์จอง ก่อนดำเนินบริการต่อ</p>}
      </article>)}
    </div><p className={styles.foot}>สถานะการชำระเงินและประวัติคำสั่งซื้อบันทึกในระบบหลังยืนยันกับ Stripe แล้ว ใบแจ้งหนี้ที่สร้างที่นี่จะไม่ส่งอีเมลอัตโนมัติ</p>
  </section>;
}
