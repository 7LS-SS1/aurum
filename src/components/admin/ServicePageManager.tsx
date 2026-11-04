"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { defaultServicePage, servicePageSchema, type ServicePageConfig } from "@/lib/service-page-config";
import styles from "./ServicePageManager.module.css";

const copyGroups: { title: string; keys: (keyof ServicePageConfig["copy"])[] }[] = [
  { title: "ส่วนแนะนำบริการ", keys: ["text1", "heroTitle", "text2", "text3", "text4", "text5"] },
  { title: "แพ็กเกจและโปรโมชั่น", keys: ["text6", "text7", "text8", "text9", "text10", "text11", "text12", "text13", "text14", "text15", "text16"] },
  { title: "บริการโฆษณา", keys: ["text17", "text18", "text19", "text20"] },
  { title: "ขั้นตอนสมัคร", keys: ["text21", "step1", "step2", "step3", "step4"] },
  { title: "เงื่อนไขและคำถามที่พบบ่อย", keys: ["text22", "contractTitle", "text23", "text24", "text25", "text26", "text27", "text28", "text29", "text30", "text31"] },
  { title: "ส่วนติดต่อและท้ายหน้า", keys: ["text32", "text33", "text34"] },
];

export function ServicePageManager({ initial }: { initial: { config: ServicePageConfig; revision: number; ready: boolean } }) {
  const [config, setConfig] = useState(initial.config);
  const [saved, setSaved] = useState(initial.config);
  const [revision, setRevision] = useState(initial.revision);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const dirty = JSON.stringify(config) !== JSON.stringify(saved);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const parsed = servicePageSchema.safeParse(config);
    if (!parsed.success) { setMessage(`ตรวจสอบข้อมูล: ${parsed.error.issues.map(issue => issue.message).join(" / ")}`); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/services", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: parsed.data, revision }) });
      const result = await response.json();
      if (!response.ok) {
        setMessage(response.status === 409 ? "มีผู้แก้ไขข้อมูลใหม่แล้ว กรุณาคัดลอกข้อความที่ต้องการเก็บไว้ แล้วโหลดหน้านี้ใหม่ก่อนบันทึกอีกครั้ง" : response.status === 503 ? "ฐานข้อมูลยังไม่พร้อม กรุณาให้ผู้ดูแลติดตั้ง migration ก่อนบันทึก" : response.status === 401 || response.status === 403 ? "ไม่มีสิทธิ์หรือเซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" : "บันทึกไม่สำเร็จ กรุณาตรวจสอบข้อมูลแล้วลองใหม่");
        return;
      }
      setConfig(result.config); setSaved(result.config); setRevision(result.revision);
      setMessage("บันทึกเรียบร้อยแล้ว หน้าบริการจะแสดงข้อมูลใหม่เมื่อเปิดหรือโหลดหน้าอีกครั้ง");
    } catch { setMessage("เชื่อมต่อไม่สำเร็จ ข้อมูลที่แก้ยังอยู่ในฟอร์ม กรุณาลองอีกครั้ง"); }
    finally { setBusy(false); }
  }

  function field(label: string, value: string | number, change: (value: string) => void, number = false) {
    return <label className={styles.field}>{label}<input required type={number ? "number" : "text"} min={number ? 0 : undefined} step={number ? 1 : undefined} value={Number.isNaN(value) ? "" : value} onChange={event => change(event.target.value)} /></label>;
  }

  return <form className={styles.form} onSubmit={save}>
    <div className={styles.toolbar}><div><strong>{dirty ? "มีการแก้ไขที่ยังไม่บันทึก" : "ข้อมูลล่าสุดที่โหลด"}</strong><p>การบันทึกมีผลกับหน้าขายบริการ ไม่เปลี่ยนสิทธิ์หรือสัญญาของลูกค้าเดิม</p></div><Link href="/services" target="_blank">ดูหน้าบริการ ↗</Link><button className="btn-gold" type="submit" disabled={busy || !initial.ready || !dirty}>{busy ? "กำลังบันทึก…" : "บันทึกและเผยแพร่"}</button></div>
    {!initial.ready && <p role="alert" className={styles.notice}>ยังไม่ได้ติดตั้งตารางตั้งค่าหน้าบริการ จึงยังบันทึกไม่ได้ หน้าสาธารณะยังแสดงข้อมูลเดิม</p>}
    {message && <p role="status" className={styles.notice}>{message}</p>}
    <fieldset disabled={busy || !initial.ready} className={styles.body}>
      <section className={styles.section}><h2>ข้อมูลหลักและช่องทางติดต่อ</h2><div className={styles.grid}>
        {field("Telegram เช่น https://t.me/thaitubevideo", config.telegram, telegram => setConfig({ ...config, telegram }))}
        {field("ค่าโฮสติ้งเดือนถัดไป (บาท/เดือน)", config.hosting, hosting => setConfig({ ...config, hosting: Number(hosting) }), true)}
        {field("สัญญาขั้นต่ำ (เดือน)", config.contractMonths, contractMonths => setConfig({ ...config, contractMonths: Number(contractMonths) }), true)}
      </div></section>
      <section className={styles.section}><h2>แพ็กเกจเว็บไซต์และคอนเทนต์</h2><p>ราคารวมสำหรับเว็บไซต์ใหม่คำนวณจากค่าบริการรายเดือน + ค่าโฮสติ้งโดยอัตโนมัติ</p><div className={styles.grid}>
        {config.plans.map((plan, index) => <div className={styles.card} key={index}>
          <label><input type="checkbox" checked={plan.enabled} onChange={event => setConfig({ ...config, plans: config.plans.map((item, i) => i === index ? { ...item, enabled: event.target.checked } : item) })} /> แสดงแพ็กเกจนี้</label>
          {field("ชื่อแพ็กเกจ", plan.name, name => setConfig({ ...config, plans: config.plans.map((item, i) => i === index ? { ...item, name } : item) }))}
          {field("คำอธิบาย", plan.intro, intro => setConfig({ ...config, plans: config.plans.map((item, i) => i === index ? { ...item, intro } : item) }))}
          {(["first", "monthly"] as const).map(key => <div key={key}>{field(key === "first" ? "ราคาเดือนแรก (บาท)" : "ค่าบริการเดือนถัดไป ไม่รวมโฮสติ้ง (บาท)", plan[key], value => setConfig({ ...config, plans: config.plans.map((item, i) => i === index ? { ...item, [key]: Number(value) } : item) }), true)}</div>)}
        </div>)}
      </div></section>
      <section className={styles.section}><h2>ตัวเลือกเสริมโฆษณา</h2><div className={styles.grid}>
        {config.ads.map((ad, index) => <div className={styles.card} key={index}>
          <label><input type="checkbox" checked={ad.enabled} onChange={event => setConfig({ ...config, ads: config.ads.map((item, i) => i === index ? { ...item, enabled: event.target.checked } : item) })} /> แสดงบริการนี้</label>
          {field("ชื่อบริการ", ad.name, name => setConfig({ ...config, ads: config.ads.map((item, i) => i === index ? { ...item, name } : item) }))}
          {field("คำอธิบาย", ad.text, text => setConfig({ ...config, ads: config.ads.map((item, i) => i === index ? { ...item, text } : item) }))}
          {(["first", "monthly"] as const).map(key => <div key={key}>{field(key === "first" ? "ราคาเดือนแรก (บาท)" : "เดือนถัดไป (บาท/เดือน)", ad[key], value => setConfig({ ...config, ads: config.ads.map((item, i) => i === index ? { ...item, [key]: Number(value) } : item) }), true)}</div>)}
        </div>)}
      </div></section>
      <section className={styles.section}><h2>ข้อความ โปรโมชั่น และเงื่อนไข</h2><p>ใช้ {"{contractMonths}"} แทนจำนวนเดือน เพื่อให้ตรงกับระยะสัญญาที่ตั้งไว้ ข้อความจะแสดงเป็นข้อความธรรมดา ไม่รองรับ HTML</p>
        {copyGroups.map(group => <details key={group.title} className={styles.copyGroup}><summary>{group.title}</summary>{group.keys.map(key => <label className={styles.field} key={key}>{defaultServicePage.copy[key].slice(0, 90)}{defaultServicePage.copy[key].length > 90 ? "…" : ""}<textarea rows={config.copy[key].length > 150 ? 4 : 2} maxLength={5000} value={config.copy[key]} onChange={event => setConfig({ ...config, copy: { ...config.copy, [key]: event.target.value } })} /></label>)}</details>)}
      </section>
    </fieldset>
  </form>;
}
