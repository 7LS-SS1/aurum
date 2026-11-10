"use client";

import { useState } from "react";
import Link from "next/link";
import type { AdsPageConfig } from "@/lib/ads-page-config";
import styles from "./ServicePageManager.module.css";

export type AdsTargetSite = { id: string; name: string; baseUrl: string; isActive: boolean };
type Website = AdsPageConfig["websites"][number];

function canonical(url: string) {
  try { const value = new URL(url); return `${value.host.toLowerCase()}${value.pathname.replace(/\/+$/, "")}`; }
  catch { return url; }
}
function usable(site: AdsTargetSite) {
  try { const url = new URL(site.baseUrl); return site.isActive && url.protocol === "https:" && !url.username && !url.password; }
  catch { return false; }
}

export function AdsWebsiteSelector({ websites, targetSites, onChange }: {
  websites: Website[]; targetSites: AdsTargetSite[]; onChange: (websites: Website[]) => void;
}) {
  const [selected, setSelected] = useState("");
  const choices = targetSites.filter(site => usable(site) && !websites.some(item => canonical(item.url) === canonical(site.baseUrl)));
  const selectedSite = choices.find(site => site.id === selected);
  function choose(id: string, targetId: string) {
    const target = choices.find(site => site.id === targetId);
    if (!target) return;
    onChange(websites.map(site => site.id === id ? { ...site, name: target.name, url: target.baseUrl } : site));
  }
  return <section className={styles.section}>
    <h2>เว็บไซต์สำหรับลงโฆษณา</h2>
    <p>เลือกเว็บไซต์จากเว็บปลายทางที่ผูกกับ Aurum ชื่อและ URL จะเติมให้อัตโนมัติ แต่ละเว็บไซต์มีพื้นที่จองแยกกัน</p>
    <label className={styles.field}>เลือกเว็บปลายทางเพื่อเพิ่ม
      <select value={selectedSite ? selected : ""} onChange={event => setSelected(event.target.value)}>
        <option value="">เลือกเว็บไซต์…</option>
        {choices.map(site => <option key={site.id} value={site.id}>{site.name} — {site.baseUrl}</option>)}
      </select>
    </label>
    <button type="button" className="btn-gold" disabled={!selectedSite || websites.length >= 100} onClick={() => {
      if (!selectedSite) return;
      onChange([...websites, { id: crypto.randomUUID(), name: selectedSite.name, url: selectedSite.baseUrl, enabled: false }]);
      setSelected("");
    }}>เพิ่มเว็บไซต์ที่เลือก</button>
    <p>แสดงเว็บที่เปิดใช้งานและใช้ HTTPS เท่านั้น เว็บไซต์ที่เพิ่มแล้วจะไม่แสดงซ้ำ · <Link href="/admin/sites">จัดการเว็บปลายทาง</Link></p>
    {!choices.length && <p role="status">ไม่มีเว็บไซต์ที่เพิ่มได้ในขณะนี้</p>}
    {websites.map(site => {
      const target = targetSites.find(item => canonical(item.baseUrl) === canonical(site.url));
      const placeholder = !target && /^https:\/\/example\.com\/?$/.test(site.url) && !site.enabled;
      return <article key={site.id} className={styles.card}>
        <h3>{site.name}</h3>
        {placeholder ? <label className={styles.field}>เลือกเว็บปลายทางแทนเว็บไซต์ตัวอย่าง
          <select value="" onChange={event => choose(site.id, event.target.value)}>
            <option value="">เลือกเว็บไซต์…</option>
            {choices.map(item => <option key={item.id} value={item.id}>{item.name} — {item.baseUrl}</option>)}
          </select>
        </label> : <>
          <p>{site.url}</p>
          {target ? <button type="button" disabled={!usable(target) || (target.name === site.name && target.baseUrl === site.url)} onClick={() => onChange(websites.map(item => item.id === site.id ? { ...item, name: target.name, url: target.baseUrl } : item))}>ใช้ชื่อและ URL ล่าสุดจากเว็บปลายทาง</button> : <p>รายการเดิมที่ยังไม่ตรงกับเว็บปลายทางในทะเบียน</p>}
          {target && !target.isActive && <p>เว็บปลายทางนี้ปิดใช้งานอยู่ โปรดตรวจสอบก่อนเปิดรับจอง</p>}
        </>}
        <p>Website ID สำหรับ AURUM Ads: <code>{site.id}</code></p>
        <label><input type="checkbox" checked={site.enabled} disabled={placeholder} onChange={event => onChange(websites.map(item => item.id === site.id ? { ...item, enabled: event.target.checked } : item))} /> เปิดให้ลูกค้าเลือกจอง</label>
      </article>;
    })}
    <p>กดบันทึกการเปลี่ยนแปลงเพื่อเผยแพร่ การอัปเดตข้อมูลเว็บไซต์เดิมจะคง Website ID และประวัติการจองไว้</p>
  </section>;
}
