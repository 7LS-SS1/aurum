"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import s from "./OrderSupport.module.css";
type Info = { canRenew: boolean; deadline: string | null; renewalOfId: string | null; pending: { id: string; status: string } | null };
export function OrderRenewal({ id }: { id: string }) {
  const [info, setInfo] = useState<Info | null>(null), [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function load() { try { const res = await fetch("/api/public/account/renewal?id=" + id, { cache: "no-store" }); if (!res.ok) throw Error(); const data = await res.json(); if (!cancelled) { setInfo(data); setError(false); } } catch { if (!cancelled) setError(true); } }
    void load(); const timer = setInterval(() => { if (!document.hidden) void load(); }, 60000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [id]);
  if (error) return <p role="status">ยังตรวจสิทธิ์ต่ออายุไม่ได้ กรุณาอัปเดตหน้าแล้วลองอีกครั้ง</p>;
  if (!info) return null;
  if (info.pending) return <section className={s.contract}><strong>รายการต่ออายุของสัญญานี้</strong><p>ตรวจยอด ชำระเงิน และติดตามการอนุมัติในรายการต่ออายุ</p><Link className="ui-button" href={`/services/ads-banner/checkout/${info.pending.id}`}>ดูรายการต่ออายุ →</Link></section>;
  if (!info.deadline) return info.renewalOfId ? <section className={s.contract}><strong>คำสั่งซื้อต่ออายุ</strong><p>ชำระเงินแล้วรอเจ้าหน้าที่อนุมัติ · รอบใหม่จะนับต่อจากวันสิ้นสุดเดิม</p><Link href={`/services/ads-banner/checkout/${info.renewalOfId}`}>ดูสัญญารอบก่อน →</Link></section> : null;
  return <section className={s.contract}><strong>ต่ออายุบริการ</strong>{info.canRenew ? <><p>ชำระภายใน {new Date(info.deadline).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })} · ช่วงผ่อนผัน 3 วันยังคงแสดงป้าย</p><p>รอบใหม่เริ่มต่อจากวันสิ้นสุดเดิมเมื่อเจ้าหน้าที่อนุมัติ เลือกใช้ตำแหน่งเดิมหรือปรับตำแหน่งและเพิ่มพื้นที่ได้</p><div className={s.renewalActions}><Link className="ui-button ui-button--primary" href={`/services/ads-banner/book?renew=${id}&mode=same`}>↻ ต่ออายุตำแหน่งเดิม</Link><Link className="ui-button" href={`/services/ads-banner/book?renew=${id}&mode=change`}>เปลี่ยน / เพิ่มตำแหน่ง →</Link></div></> : <><p>รายการนี้ไม่อยู่ในช่วงที่เปิดให้ต่ออายุ หากพ้น 3 วันหลังสัญญาสิ้นสุด ต้องเลือกพื้นที่และเปิดสัญญาใหม่</p><Link className="ui-button" href="/services/ads-banner/book">เปิดสัญญาใหม่ →</Link></>}</section>;
}
