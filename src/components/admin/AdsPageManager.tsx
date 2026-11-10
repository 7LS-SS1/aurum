"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adsPageSchema, type AdsPageConfig } from "@/lib/ads-page-config";
import { CouponEditor } from "./CouponEditor";
import { AdsWebsiteSelector, type AdsTargetSite } from "./AdsWebsiteSelector";
import styles from "./ServicePageManager.module.css";

export function AdsPageManager({ initial, targetSites }: { initial: { config: AdsPageConfig; revision: number; ready: boolean }; targetSites: AdsTargetSite[] }) {
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
    const parsed = adsPageSchema.safeParse(config);
    if (!parsed.success) { setMessage(parsed.error.issues.map(issue => issue.path.join(".") + ": " + issue.message).join(" / ")); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/ads-banner", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: parsed.data, revision }) });
      const result = await response.json();
      if (!response.ok) {
        if (result.error === "inventory_in_use") { setMessage("เปลี่ยนจำนวนช่องไม่ได้ขณะที่มีคำสั่งซื้อกันพื้นที่อยู่ กรุณาจัดการคำสั่งซื้อก่อน"); return; }
        setMessage(response.status === 409 ? "มีผู้แก้ไขข้อมูลใหม่แล้ว กรุณาคัดลอกงานที่ต้องการเก็บไว้ แล้วโหลดหน้าใหม่ก่อนบันทึก" : response.status === 401 || response.status === 403 ? "ไม่มีสิทธิ์หรือเซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" : "บันทึกไม่สำเร็จ ข้อมูลยังอยู่ในฟอร์ม กรุณาลองใหม่");
        return;
      }
      setConfig(result.config); setSaved(result.config); setRevision(result.revision);
      setMessage("บันทึกแล้ว โปรโมชั่นที่เลือกเผยแพร่จะแสดงบนหน้าสาธารณะ");
    } catch { setMessage("เชื่อมต่อไม่สำเร็จ ข้อมูลยังอยู่ในฟอร์ม"); }
    finally { setBusy(false); }
  }
  function field(label: string, value: string | number, change: (value: string) => void, optional = false) {
    return <label className={styles.field}>{label}<input required={!optional} type={typeof value === "number" ? "number" : "text"} min={0} step={1} value={Number.isNaN(value) ? "" : value} onChange={event => change(event.target.value)} /></label>;
  }
  function updatePost(index: number, changes: Partial<AdsPageConfig["promotions"][number]>) {
    setConfig({ ...config, promotions: config.promotions.map((post, i) => i === index ? { ...post, ...changes } : post) });
  }
  return <form className={styles.form} onSubmit={save}>
    <div className={styles.toolbar}><div><strong>{dirty ? "มีการแก้ไขที่ยังไม่บันทึก" : "ข้อมูลล่าสุด"}</strong><p>จัดการพื้นที่โฆษณาบนเว็บไซต์ของเรา แยกจากบริการ Website API</p></div><Link href="/services/ads-banner" target="_blank">ดูหน้าสาธารณะ ↗</Link><button type="submit" className="btn-gold" disabled={busy || !initial.ready || !dirty}>{busy ? "กำลังบันทึก…" : "บันทึกการเปลี่ยนแปลง"}</button></div>
    {message && <p role="status" className={styles.notice}>{message}</p>}
    {!initial.ready && <p role="alert">ตารางตั้งค่ายังไม่พร้อม กรุณาติดตั้ง migration ของหน้าบริการก่อนบันทึก</p>}
    <fieldset className={styles.body} disabled={busy || !initial.ready}>
      <AdsWebsiteSelector websites={config.websites} targetSites={targetSites} onChange={websites => setConfig({ ...config, websites })} />
      <section className={styles.section}><h2>ตำแหน่งโฆษณา</h2><p>Banner หลัก 32 ช่อง · Popup และ Fixed ตำแหน่งละ 1 ช่อง · Video Ads ใช้ตัวเล่นเดียว เรียงลำดับ 1–3 แต่ละลำดับรับได้หนึ่งคำสั่งซื้อ สถานะจองตรวจสอบจาก AURUM</p></section>
      <section className={styles.section}><h2>โพสต์โปรโมชั่น</h2><p>โพสต์ใหม่เป็นฉบับร่าง เลือก “เผยแพร่” แล้วบันทึกเพื่อแสดงบนหน้าสาธารณะ เรียงโพสต์ใหม่ไว้ด้านบน</p>
        <button type="button" className="btn-gold" disabled={config.promotions.length >= 30} onClick={() => setConfig({ ...config, promotions: [{ id: crypto.randomUUID(), title: "โปรโมชั่นใหม่", body: "รายละเอียดโปรโมชั่น", imageUrl: "", published: false }, ...config.promotions] })}>เพิ่มโปรโมชั่น</button>
        {config.promotions.map((post, index) => <article className={styles.card} key={post.id}>
          <h3>{post.published ? "เผยแพร่" : "ฉบับร่าง"} · {post.title}</h3>
          {field("หัวข้อโปรโมชั่น", post.title, title => updatePost(index, { title }))}
          <label className={styles.field}>รายละเอียดและเงื่อนไข<textarea required rows={5} value={post.body} onChange={event => updatePost(index, { body: event.target.value })} /></label>
          {field("URL รูปภาพ (ไม่บังคับ) — HTTPS หรือ /images/...", post.imageUrl, imageUrl => updatePost(index, { imageUrl }), true)}
          <label><input type="checkbox" checked={post.published} onChange={event => updatePost(index, { published: event.target.checked })} /> เผยแพร่บนหน้า Ads Banner หลังบันทึก</label>
          <div><button type="button" onClick={() => { if (window.confirm("ลบโปรโมชั่นนี้? การลบจะมีผลเมื่อบันทึก")) setConfig({ ...config, promotions: config.promotions.filter(item => item.id !== post.id) }); }}>ลบโปรโมชั่น</button></div>
        </article>)}
      </section>
      <section className={styles.section}><CouponEditor coupons={config.coupons} onChange={coupons => setConfig({ ...config, coupons })} /></section>
      <section className={styles.section}><h2>เนื้อหาหน้าและช่องทางติดต่อ</h2>
        {field("Telegram", config.telegram, telegram => setConfig({ ...config, telegram }))}
        <div className={styles.grid}>{Object.entries(config.copy).map(([key, value]) => <label className={styles.field} key={key}>{initial.config.copy[key as keyof typeof config.copy].slice(0, 70)}<textarea required rows={3} value={value} onChange={event => setConfig({ ...config, copy: { ...config.copy, [key]: event.target.value } })} /></label>)}</div>
      </section>
      <section className={styles.section}><h2>สิทธิประโยชน์</h2>{config.benefits.map((row, index) => <div className={styles.grid} key={index}>{row.map((value, cell) => <div key={cell}>{field(["ลำดับ", "หัวข้อ", "รายละเอียด"][cell]!, value, next => setConfig({ ...config, benefits: config.benefits.map((r, i) => i === index ? r.map((v, c) => c === cell ? next : v) as typeof row : r) }))}</div>)}</div>)}</section>
      <section className={styles.section}><h2>ราคาพื้นที่โฆษณา</h2>{config.groups.map((group, index) => {
        const update = (changes: Partial<typeof group>) => setConfig({ ...config, groups: config.groups.map((item, i) => i === index ? { ...item, ...changes } : item) });
        return <div className={styles.card} key={index}>
          {field("ชื่อหมวด", group.title, title => update({ title }))}
          {field("คำอธิบายหมวด", group.subtitle, subtitle => update({ subtitle }))}
          {group.rows.map((row, rowIndex) => <div className={styles.grid} key={rowIndex}>{row.map((value, cell) => <div key={cell}>{field(["ชื่อตำแหน่ง", "คำอธิบาย", "ราคา (บาท)", "หน่วยราคา"][cell]!, value, next => update({ rows: group.rows.map((r, i) => i === rowIndex ? r.map((v, c) => c === cell ? cell === 2 ? Number(next) : next : v) as typeof row : r) }))}</div>)}</div>)}
          {field("ชื่อแพ็กเกจเหมา", group.bundle, bundle => update({ bundle }))}
          {field("ราคาเหมาต่อเดือน (บาท)", group.total, total => update({ total: Number(total) }))}
        </div>;
      })}</section>
      <section className={styles.section}><h2>แพ็กเกจเหมาทั้งเว็บไซต์</h2><div className={styles.grid}>{config.packages.map((plan, index) => <div className={styles.card} key={index}>{(["months", "price", "discount"] as const).map(key => <div key={key}>{field({ months: "จำนวนเดือน", price: "ราคารวม (บาท)", discount: "ส่วนลด (%)" }[key], plan[key], value => setConfig({ ...config, packages: config.packages.map((item, i) => i === index ? { ...item, [key]: Number(value) } : item) }))}</div>)}</div>)}</div></section>
    </fieldset>
  </form>;
}
