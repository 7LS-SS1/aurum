"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import s from "./Ops.module.css";

type Status = "QUEUED" | "DOWNLOADING" | "DONE" | "FAILED";
interface Job { id: string; sourceUrl: string; title: string; mainCategory: string; status: Status; attempts: number; error: string | null; bytes: number | null; movieId: string | null; createdAt: string }
type LinkCheck = { ok: true; kind: "file" | "page"; format: string; title: string; mediaUrl: string; bytes: number | null } | { ok: false; error: string };

const LABEL: Record<Status, string> = { QUEUED: "รอคิว", DOWNLOADING: "กำลังดาวน์โหลด", DONE: "เสร็จ · รอตรวจสอบ", FAILED: "ล้มเหลว" };
const FILTERS: Array<{ key: Status | "ALL"; label: string }> = [{ key: "ALL", label: "ทั้งหมด" }, { key: "QUEUED", label: "รอคิว" }, { key: "DOWNLOADING", label: "กำลังโหลด" }, { key: "DONE", label: "เสร็จแล้ว" }, { key: "FAILED", label: "ล้มเหลว" }];

const size = (bytes: number | null) => bytes === null ? "—" : bytes > 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
const list = (value: string) => value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);

/** Each line: URL  |  ชื่อเรื่อง (ไม่บังคับ)  |  URL ภาพปก (ไม่บังคับ) */
function parseLines(text: string) {
  return text.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const [sourceUrl, title, thumbnailUrl] = line.split("|").map((part) => part.trim());
    return { line, item: { sourceUrl, ...(title ? { title } : {}), ...(thumbnailUrl ? { thumbnailUrl } : {}) } };
  });
}

export function AutoDownloadManager({ mainCategories, initialJobs }: { mainCategories: string[]; initialJobs: Job[] }) {
  const [jobs, setJobs] = useState(initialJobs);
  const [filter, setFilter] = useState<Status | "ALL">("ALL");
  const [lines, setLines] = useState("");
  const [mainCategory, setMainCategory] = useState(mainCategories[0] ?? "");
  const [categories, setCategories] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [checks, setChecks] = useState<LinkCheck[]>([]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/auto-downloads", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setJobs(await res.json());
  }, []);

  const active = jobs.some((job) => job.status === "QUEUED" || job.status === "DOWNLOADING");
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [active, refresh]);

  const counts = useMemo(() => jobs.reduce((acc, job) => ({ ...acc, [job.status]: (acc[job.status] ?? 0) + 1 }), {} as Partial<Record<Status, number>>), [jobs]);
  const shown = filter === "ALL" ? jobs : jobs.filter((job) => job.status === filter);
  const parsed = parseLines(lines);
  const ready = parsed.flatMap(({ item }, index) => {
    const check = checks[index];
    return check?.ok ? [{ ...item, title: item.title || check.title || undefined }] : [];
  });

  async function checkLinks() {
    setBusy("check"); setMessage(null); setChecks([]);
    const results: LinkCheck[] = [];
    try {
      for (let start = 0; start < parsed.length; start += 5) {
        const urls = parsed.slice(start, start + 5).map(({ item }) => item.sourceUrl);
        const res = await fetch("/api/auto-downloads/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ urls }) });
        const body = await res.json();
        if (!res.ok || body.checks?.length !== urls.length) throw new Error(body.issues?.[0]?.message || body.error || "ตรวจสอบลิงก์ไม่สำเร็จ");
        results.push(...body.checks);
        setChecks([...results]);
      }
    } catch (cause) { setMessage({ text: cause instanceof Error ? cause.message : "ตรวจสอบลิงก์ไม่สำเร็จ", error: true }); }
    finally { setBusy(null); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready.length || busy) return;
    setBusy("submit"); setMessage(null);
    try {
      const res = await fetch("/api/auto-downloads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mainCategory, categories: list(categories), tags: list(tags), items: ready }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.issues?.[0]?.message || body.error || "เพิ่มคิวไม่สำเร็จ");
      setLines(parsed.filter((_, index) => !checks[index]?.ok).map(({ line }) => line).join("\n"));
      setChecks([]);
      await refresh();
      await startProcessing(body.ids);
    } catch (cause) { setMessage({ text: cause instanceof Error ? cause.message : "เพิ่มคิวไม่สำเร็จ", error: true }); }
    finally { setBusy(null); }
  }

  async function startProcessing(ids?: string[]) {
    setBusy("process"); setMessage(null);
    const poll = setInterval(refresh, 3000);
    try {
      const res = await fetch("/api/auto-downloads/process", { method: "POST", ...(ids ? { headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) } : {}) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "ประมวลผลไม่สำเร็จ");
      const done = body.results.filter((row: { status: string }) => row.status === "DONE").length;
      const failed = new Set(body.results.filter((row: { status: string }) => row.status === "FAILED").map((row: { id: string }) => row.id)).size;
      setMessage({ text: `ดาวน์โหลดสำเร็จ ${done} รายการ${failed ? ` · ล้มเหลว ${failed} รายการ` : ""}${ids && ids.length > done + failed ? " · รายการที่เหลืออยู่ในคิวหรือกำลังทำงาน" : ""}` });
    } catch (cause) { setMessage({ text: ids ? "เพิ่มรายการเข้าคิวแล้ว แต่เริ่มทันทีไม่สำเร็จ ให้ตรวจสถานะที่คิวด้านล่าง" : cause instanceof Error ? cause.message : "ประมวลผลไม่สำเร็จ", error: true }); }
    finally { clearInterval(poll); setBusy(null); void refresh(); }
  }

  async function act(job: Job, method: "POST" | "DELETE") {
    setBusy(job.id);
    await fetch(`/api/auto-downloads/${job.id}`, { method });
    setBusy(null); refresh();
  }

  return <>
    <div className={s.head}>
      <div><h1>ดาวน์โหลดอัตโนมัติ</h1><p>วางลิงก์ไฟล์หรือหน้าเล่นวิดีโอ ตรวจลิงก์ แล้วดาวน์โหลดรายการที่ผ่านเข้า Storage เพื่อรอตรวจสอบ</p></div>
      <div className={s.headActions}><Link className="ui-button" href="/admin/review">ไปหน้ารอตรวจสอบ →</Link><button className="ui-button ui-button--primary" onClick={() => void startProcessing()} disabled={busy !== null || !active}>{busy === "process" ? "กำลังประมวลผล…" : "ประมวลผลตอนนี้"}</button></div>
    </div>

    <div className={s.stats}>
      {(["QUEUED", "DOWNLOADING", "DONE", "FAILED"] as Status[]).map((key) => <button key={key} type="button" className={s.stat} style={{ textAlign: "left", font: "inherit" }} onClick={() => setFilter(key)}><small>{LABEL[key]}</small><strong>{counts[key] ?? 0}</strong></button>)}
    </div>

    {message && <div className={`${s.notice} ${message.error ? s.noticeErr : ""}`} role="status">{message.text}</div>}

    <form className={s.card} onSubmit={submit}>
      <div className={s.cardHead}><h2>เพิ่มลิงก์เข้าคิว</h2><span className={s.meta}>{parsed.length} รายการ · สูงสุด 100 ต่อครั้ง</span></div>
      <div className={s.cardBody} style={{ display: "grid", gap: 16 }}>
        <label className={s.field}>ลิงก์ไฟล์หรือหน้าเล่นวิดีโอ (บรรทัดละ 1 รายการ)
          <textarea value={lines} disabled={busy === "check" || busy === "submit"} onChange={(e) => { setLines(e.target.value); setChecks([]); }} placeholder={"https://cdn.example.com/video-001.mp4 | ชื่อเรื่อง | https://cdn.example.com/cover-001.jpg\nhttps://example.com/watch/video-002"} required />
          <small>URL เป็น HTTPS รองรับ MP4, WebM, MOV, MKV และ HLS VOD ส่วนชื่อและ URL ภาพปกใส่เพิ่มได้โดยคั่นด้วย |</small>
        </label>
        <div aria-live="polite">
          {busy === "check" && <p className={s.meta}>ตรวจแล้ว {checks.length} จาก {parsed.length} ลิงก์</p>}
          {checks.length > 0 && <ul className={s.checkList}>{checks.map((check, index) => <li key={index}>
            <div className={s.title}>{check.ok && check.title ? check.title : `ลิงก์ที่ ${index + 1}`}</div>
            {check.ok ? <><span className={`${s.badge} ${s.DONE}`}>{check.kind === "page" ? "พบไฟล์จากหน้าเล่น" : "ไฟล์พร้อมดาวน์โหลด"} · {check.format}</span><div className={s.url}>{check.mediaUrl}</div></> : <div className={s.err}>{check.error}</div>}
          </li>)}</ul>}
        </div>
        <div className={s.grid2}>
          <label className={s.field}>หมวดหมู่หลัก
            {mainCategories.length ? <select value={mainCategory} onChange={(e) => setMainCategory(e.target.value)} required>{mainCategories.map((name) => <option key={name}>{name}</option>)}</select>
              : <input value={mainCategory} onChange={(e) => setMainCategory(e.target.value)} required placeholder="ชื่อหมวดหมู่หลัก" />}
            <small>ใช้จับคู่เว็บปลายทาง · <Link href="/admin/main-categories">จัดการหมวดหมู่หลัก</Link></small>
          </label>
          <label className={s.field}>หมวดหมู่ย่อย<input value={categories} onChange={(e) => setCategories(e.target.value)} placeholder="คั่นด้วยจุลภาค" /></label>
          <label className={s.field}>แท็ก<input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="คั่นด้วยจุลภาค" /></label>
        </div>
        <div className="ui-actions" style={{ marginTop: 0 }}>
          <button type="button" className="ui-button" onClick={checkLinks} disabled={busy !== null || !parsed.length || parsed.length > 100}>{busy === "check" ? "กำลังตรวจสอบ…" : "ตรวจสอบลิงก์"}</button>
          <button className="ui-button ui-button--primary" disabled={busy !== null || !ready.length || !mainCategory}>{busy === "submit" ? "กำลังเพิ่ม…" : `ดาวน์โหลดรายการที่ผ่าน${ready.length ? ` (${ready.length})` : ""}`}</button>
        </div>
      </div>
    </form>

    <section className={s.card}>
      <div className={s.cardHead}><h2>คิวดาวน์โหลด</h2><nav className={s.tabs}>{FILTERS.map((item) => <button key={item.key} type="button" className={`${s.tab} ${filter === item.key ? s.tabActive : ""}`} onClick={() => setFilter(item.key)}>{item.label}</button>)}</nav></div>
      {shown.length === 0 ? <div className={s.empty}><strong>ยังไม่มีรายการ</strong>เพิ่มลิงก์ด้านบนเพื่อเริ่มดาวน์โหลด</div> :
        <div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>วิดีโอ</th><th>สถานะ</th><th>ขนาด</th><th>หมวดหมู่หลัก</th><th>เพิ่มเมื่อ</th><th /></tr></thead>
          <tbody>{shown.map((job) => <tr key={job.id}>
            <td><div className={s.title}>{job.title}</div><div className={s.url} title={job.sourceUrl}>{job.sourceUrl}</div>{job.error && <div className={s.err}>{job.error}{job.status === "QUEUED" ? ` · ลองใหม่ครั้งที่ ${job.attempts + 1}` : ""}</div>}</td>
            <td><span className={`${s.badge} ${s[job.status]}`}>{LABEL[job.status]}</span></td>
            <td className={s.meta}>{size(job.bytes)}</td>
            <td className={s.meta}>{job.mainCategory}</td>
            <td className={s.meta}>{new Date(job.createdAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</td>
            <td><div className={s.rowActions}>
              {job.movieId && <Link className={`ui-button ${s.small}`} href={`/admin/videos/${job.movieId}`}>ตรวจสอบ</Link>}
              {job.status === "FAILED" && <button className={`ui-button ${s.small}`} disabled={busy === job.id} onClick={() => act(job, "POST")}>ลองใหม่</button>}
              {(job.status === "FAILED" || job.status === "QUEUED") && <button className={`ui-button ui-button--quiet ${s.small}`} disabled={busy === job.id} onClick={() => act(job, "DELETE")}>ลบ</button>}
            </div></td>
          </tr>)}</tbody>
        </table></div>}
    </section>
  </>;
}
