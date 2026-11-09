"use client";
import { useEffect, useState } from "react";
import { getRenewal, renewalDeadline } from "@/lib/ads-renewal";
import s from "./OrderSupport.module.css";
export function ContractSummary({ startsAt, endsAt, days, status, quote }: { quote?: unknown; startsAt: string | null; endsAt: string | null; days: number; status: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const renewal = getRenewal(quote);
  const remaining = now && endsAt ? Math.max(0, Math.ceil((Date.parse(endsAt) - now) / 60000)) : 0;
  const date = (value: string) => new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
  return <section className={s.contract} aria-label="ระยะสัญญาอัตโนมัติ"><strong>{renewal ? "รอบต่ออายุ" : "ระยะสัญญา"} {days} วัน</strong>{startsAt && endsAt ? <><dl><div><dt>เริ่มสัญญา</dt><dd>{date(startsAt)}</dd></div><div><dt>สิ้นสุดสัญญา</dt><dd>{date(endsAt)}</dd></div></dl>{status === "SCHEDULED" && <p className={s.countdown}>อนุมัติล่วงหน้าแล้ว · รอเริ่มรอบใหม่ตามวันเริ่มข้างต้น</p>}{status === "GRACE" && <p className={s.countdown}>ยังคงป้ายไว้ · ชำระต่ออายุภายใน {date(renewalDeadline(new Date(endsAt)).toISOString())} หากชำระทันกำหนด ระบบจะรอเจ้าหน้าที่อนุมัติ</p>}{status === "ACTIVE" && now !== null && <p className={s.countdown}>{remaining > 0 ? `คงเหลือ ${Math.floor(remaining / 1440)} วัน ${Math.floor(remaining % 1440 / 60)} ชั่วโมง ${remaining % 60} นาที` : "ครบกำหนดสิ้นสุดบริการแล้ว"}</p>}<small>เวลาประเทศไทย · {renewal ? "รอบต่ออายุนับต่อจากวันสิ้นสุดเดิม" : "คำนวณจากเวลาอนุมัติเริ่มบริการที่ระบบบันทึก"}</small></> : renewal ? <><p>เมื่อชำระทันกำหนดและเจ้าหน้าที่อนุมัติ รอบใหม่จะนับจาก {date(renewal.previousEndsAt)} ถึง {date(new Date(Date.parse(renewal.previousEndsAt) + days * 86400000).toISOString())}</p><small>ชำระภายใน {date(renewal.deadline)} · {renewal.mode === "same" ? "คงตำแหน่งเดิม" : "เปลี่ยน / เพิ่มตำแหน่ง · เจ้าหน้าที่สลับป้ายเมื่อถึงรอบใหม่"}</small></> : <p>ระบบจะบันทึกเวลาที่เจ้าหน้าที่อนุมัติเป็นวันเริ่ม และคำนวณวันสิ้นสุดให้อัตโนมัติอีก {days} วัน</p>}</section>;
}
