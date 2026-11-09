"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { orderGroups, type OrderGroup } from "@/lib/ads-order-groups";
import panel from "./AdsOrdersManager.module.css";
import type { AdminAdsOrder as Order } from "@/lib/ads-order-workflow";
const date=(value:string|null)=>value?new Date(value).toLocaleString("th-TH",{timeZone:"Asia/Bangkok"}):"ยังไม่มีข้อมูล";
import { getSimulation, simulationLabel } from "@/lib/ads-simulation";
import { getPromptPay } from "@/lib/promptpay";
import { statusLabels } from "@/lib/ads-booking";
import styles from "./ServicePageManager.module.css";

export function AdsOrdersManager({group="all",query=""}:{group?:OrderGroup;query?:string}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [simulationMode, setSimulationMode] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [counts,setCounts]=useState<Record<string,number>>({});
  const [loading,setLoading]=useState(true);
  const load = useCallback(async (next?: string) => {
    const response = await fetch("/api/ads-orders?group=" + group + "&q=" + encodeURIComponent(query) + (next ? "&cursor=" + encodeURIComponent(next) : ""), { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error("โหลดคำสั่งซื้อไม่ได้ กรุณาตรวจสิทธิ์และติดตั้ง migration สำหรับคำสั่งซื้อ");
    setOrders(old => next ? [...old, ...result.orders] : result.orders); setCursor(result.nextCursor); setReady(result.paymentReady);setSimulationMode(result.simulationEnabled);setCounts(result.counts||{});setLoading(false);
  }, [group,query]);
  useEffect(() => { load().catch(error => {setMessage(error.message);setLoading(false);}); }, [load]);
  return <div className={styles.form}>
    <div className={styles.toolbar}><div><h1>คำสั่งซื้อพื้นที่โฆษณา</h1><p>จัดการบริการตามสถานะ · วันและเวลาแสดงตามประเทศไทย</p></div><button disabled={busy} type="button" onClick={() => load().catch(error => setMessage(error.message))}>โหลดรายการใหม่</button></div>
    <form action="/admin/ads-orders" method="get" role="search" className={panel.search}><input type="hidden" name="group" value={group}/><label htmlFor="order-number-search">ค้นหาจากเลขที่คำสั่งซื้อ<input id="order-number-search" type="search" name="q" defaultValue={query} maxLength={100} placeholder="กรอกเลขเต็มหรือบางส่วนของเลขคำสั่งซื้อ" autoComplete="off" spellCheck={false}/></label><button type="submit" className="ui-button ui-button--primary" disabled={busy}>ค้นหา</button>{query&&<Link href={`/admin/ads-orders?group=${group}`} className="ui-button">ล้างการค้นหา</Link>}</form>
    {query&&<p className={panel.searchHint} role="status">ผลการค้นหา “{query}” · {loading?"กำลังโหลด…":`${counts[group]??0} รายการในหมวดนี้`} · จำนวนในแต่ละหมวดแสดงเฉพาะผลที่ตรงกับการค้นหา</p>}
    <nav className={panel.tabs} aria-label="ประเภทสถานะคำสั่งซื้อ">{Object.entries(orderGroups).map(([key,item])=><Link key={key} href={`/admin/ads-orders?group=${key}${query?`&q=${encodeURIComponent(query)}`:""}`} aria-current={key===group?"page":undefined}><span>{item.label}</span><strong>{counts[key]??"—"}</strong></Link>)}</nav>
    <div className={panel.heading}><h2>{orderGroups[group].label}</h2><p>{orderGroups[group].description} · โหลดครั้งละไม่เกิน 100 รายการ</p></div>
    {simulationMode && <p className={styles.notice}><strong>โหมดจำลองเปิดอยู่</strong> · รายการ DEMO ใช้ทดสอบชำระเงิน ตรวจยอด และติดตามงาน ไม่มีการรับเงินจริง พื้นที่ทดสอบแยกจากรายการจริง</p>}
    {!loading&&!ready&&!simulationMode && <p className={styles.notice}>ยังไม่เปิดรับเงินจริง ต้องผ่านการอนุมัติจากผู้ให้บริการและตั้งค่า Gateway ก่อนส่งลิงก์ชำระเงิน</p>}
    <p>{simulationMode ? "เปิดรายการ DEMO เพื่อตรวจยอดจำลอง รับงาน อัปเดตการติดตั้ง และอนุมัติเริ่มสัญญา" : "การชำระและคืนเงินในรุ่นนี้ยืนยันโดยเจ้าหน้าที่หลังตรวจรายการจริงกับผู้ให้บริการ ระบบยังไม่รับผลอัตโนมัติจาก Gateway"}</p>
    {message && <p role="status" className={styles.notice}>{message}</p>}
    {orders.length>0&&<div className={panel.tableScroll} role="region" aria-label="รายการคำสั่งซื้อ" tabIndex={0}><table className={panel.table}><caption>รายการคำสั่งซื้อ · กดดูรายละเอียดเพื่อดูสื่อและดำเนินการต่อ</caption><thead><tr><th scope="col">เลขคำสั่งซื้อ / วันที่สั่ง</th><th scope="col">ลูกค้า</th><th scope="col">เว็บไซต์ / พื้นที่</th><th scope="col">สถานะ</th><th scope="col">ยอดเงิน</th><th scope="col">ดำเนินการ</th></tr></thead><tbody>
    {orders.map(order => <tr key={order.id}><td><code>{order.id}</code>{(getSimulation(order.quote)||getPromptPay(order.quote))&&<small>DEMO · รายการทดสอบ</small>}<small>{date(order.createdAt)}</small></td><td><strong>{order.customer.name}</strong><small>{order.customer.email||order.customer.contact||"ไม่ได้ระบุ"}</small></td><td><strong>{order.quote.website?.name||"เว็บไซต์ไม่ได้ระบุ"}</strong><small>{order.slots.length} ช่อง · {order.days} วัน</small></td><td><span className={panel.badge} data-status={order.status}>{simulationLabel(order.status,getSimulation(order.quote))||statusLabels[order.status]||order.status}</span></td><td className={panel.amount}>{order.amount.toLocaleString()}<small>บาท</small></td><td><Link className="ui-button" href={`/admin/ads-orders/${order.id}?group=${group}${query?`&q=${encodeURIComponent(query)}`:""}`} aria-label={`ดูรายละเอียดคำสั่งซื้อ ${order.id}`}>ดูรายละเอียด →</Link></td></tr>
    )}
    </tbody></table></div>}
    {cursor && <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await load(cursor); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } }}>โหลดรายการก่อนหน้า</button>}
    {loading&&<p role="status">กำลังโหลดคำสั่งซื้อ…</p>}
    {!loading&&!orders.length && <div className={panel.empty}><p>{query?"ไม่พบเลขคำสั่งซื้อที่ตรงกับการค้นหา":"ไม่มีรายการ"}ในหมวด {orderGroups[group].label}</p>{query&&group!=="all"&&<Link href={`/admin/ads-orders?group=all&q=${encodeURIComponent(query)}`}>ค้นหาเลขนี้ในทุกสถานะ →</Link>}</div>}
  </div>;
}
