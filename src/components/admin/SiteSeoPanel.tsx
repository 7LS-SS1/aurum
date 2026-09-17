"use client";
import Link from "next/link";
import { useState } from "react";
import { apiFetch } from "@/lib/api-client";
type Draft = { siteId: string; title: string | null; extraMeta: unknown };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function SiteSeoPanel({ movieId, title, keywords, sites, initialDrafts }: {
  movieId: string; title: string; keywords: string; sites: { id: string; name: string }[]; initialDrafts: Draft[];
}) {
  const [terms, setTerms] = useState(keywords);
  const [selected, setSelected] = useState(sites.map(site => site.id));
  const [drafts, setDrafts] = useState(initialDrafts);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  function edit(siteId: string, field: "title" | "rank_math_description", value: string) {
    setDrafts(previous => previous.map(draft => draft.siteId !== siteId ? draft : field === "title"
      ? { ...draft, title: value, extraMeta: { ...record(draft.extraMeta), rank_math_title: value } }
      : { ...draft, extraMeta: { ...record(draft.extraMeta), [field]: value } }));
  }
  return <section><div className="page-head"><h1>ชื่อและ SEO รายเว็บไซต์</h1><p>ชื่อหลัก: {title}</p>
    <Link href={`/admin/videos/${movieId}`}>กลับไปหน้าวิดีโอ</Link></div>
    <div className="card" style={{ padding: 24, display: "grid", gap: 16 }}>
      <label>Keywords (คั่นด้วยเครื่องหมายจุลภาค)<input value={terms} onChange={e => setTerms(e.target.value)} style={{ width: "100%" }} /></label>
      <p>สร้างและบันทึกร่างสำหรับเว็บที่ยังไม่มีชื่อเฉพาะเว็บ แล้วตรวจแก้ก่อนส่งวิดีโอ ชื่อที่มีอยู่จะไม่ถูกเขียนทับ ปุ่มนี้ยังไม่เผยแพร่ไป WordPress</p>
      {sites.map(site => <label key={site.id}><input type="checkbox" disabled={busy} checked={selected.includes(site.id)} onChange={e => setSelected(previous => e.target.checked ? [...previous, site.id] : previous.filter(id => id !== site.id))} /> {site.name}</label>)}
      <button className="btn" disabled={busy || !selected.length || !terms.trim()} onClick={async () => {
        setBusy(true); const errors: string[] = []; let count = 0;
        for (const siteId of selected) {
          setMessage(`กำลังสร้างสำหรับ ${sites.find(site => site.id === siteId)?.name}…`);
          try {
            const draft = await apiFetch<Draft>(`/api/movies/${movieId}/generate-seo`, { method: "POST", body: JSON.stringify({ siteId, keywords: terms.split(",").map(term => term.trim()).filter(Boolean) }) });
            setDrafts(previous => [...previous.filter(item => item.siteId !== siteId), draft]); count++;
          } catch (error) { errors.push(`${sites.find(site => site.id === siteId)?.name}: ${error instanceof Error ? error.message : "ไม่สำเร็จ"}`); }
        }
        setBusy(false); setMessage(`พร้อมตรวจ ${count} เว็บไซต์ ${errors.join(" • ")}`);
      }}>สร้างชื่อและ Meta description</button>
      <p role="status">{message}</p>
      {drafts.map(draft => <div key={draft.siteId} style={{ borderTop: "1px solid #666", paddingTop: 16, display: "grid", gap: 10 }}>
        <strong>{sites.find(site => site.id === draft.siteId)?.name ?? draft.siteId}</strong>
        <label>Title<input disabled={busy} value={draft.title ?? ""} maxLength={160} onChange={e => edit(draft.siteId, "title", e.target.value)} style={{ width: "100%" }} /></label>
        <label>Meta description<textarea disabled={busy} value={String(record(draft.extraMeta).rank_math_description ?? "")} maxLength={320} onChange={e => edit(draft.siteId, "rank_math_description", e.target.value)} style={{ width: "100%" }} /></label>
        <p>Keywords: {String(record(draft.extraMeta).rank_math_focus_keyword ?? "")}</p>
        <button className="btn" disabled={busy || !draft.title?.trim()} onClick={async () => {
          setBusy(true);
          try {
            await apiFetch(`/api/movies/${movieId}/drafts/${draft.siteId}`, { method: "PUT", body: JSON.stringify({ title: draft.title, extraMeta: draft.extraMeta }) });
            setMessage("บันทึกร่างแล้ว จะใช้เมื่อนำเข้าวิดีโอครั้งแรก การส่งซ้ำแบบอัปเดตเฉพาะวิดีโอยังคง SEO บน WordPress");
          } catch (error) { setMessage(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ"); }
          finally { setBusy(false); }
        }}>บันทึกการแก้ไข</button>
      </div>)}
    </div>
  </section>;
}
