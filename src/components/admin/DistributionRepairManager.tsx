"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { isActiveSyncStatus, phaseLabelTh, type PublicSyncJob, type SyncJobLog } from "./site-sync/types";

interface RepairSite {
  id: string; name: string; isActive: boolean; healthStatus: string;
  failed: number; eligible: number; job: PublicSyncJob | null;
}
interface Overview { sites: RepairSite[]; limitPerSite: number }
interface Result { siteId: string; created: boolean; queued: number; error: string | null; job: PublicSyncJob | null }

export function DistributionRepairManager() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [jobs, setJobs] = useState<Record<string, PublicSyncJob>>({});
  const [logs, setLogs] = useState<Record<string, SyncJobLog[]>>({});
  const afterIds = useRef<Record<string, string>>({});
  const refresh = useCallback(async () => {
    const data = await apiFetch<Overview>("/api/distributions/repair");
    setOverview(data);
    setJobs(prev => ({ ...prev, ...Object.fromEntries(data.sites.filter(site => site.job).map(site => [site.id, site.job!])) }));
  }, []);
  useEffect(() => { refresh().catch(err => setError(err.message)); }, [refresh]);
  useEffect(() => {
    const active = Object.values(jobs).filter(job => isActiveSyncStatus(job.status));
    if (!active.length) return;
    let polling = false;
    let cancelled = false;
    const timer = setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        const updates = await Promise.all(active.map(job => {
          const afterId = afterIds.current[job.id];
          return apiFetch<{ job: PublicSyncJob; logs: SyncJobLog[] }>(`/api/sites/sync-jobs/${job.id}?limit=200${afterId ? `&afterId=${encodeURIComponent(afterId)}` : ""}`);
        }));
        if (cancelled) return;
        setJobs(prev => ({ ...prev, ...Object.fromEntries(updates.map(row => [row.job.siteId, row.job])) }));
        for (const row of updates) { const last = row.logs.at(-1); if (last) afterIds.current[row.job.id] = last.id; }
        setLogs(prev => ({ ...prev, ...Object.fromEntries(updates.map(row => [row.job.id, [...(prev[row.job.id] ?? []), ...row.logs].slice(-200)])) }));
        if (updates.some(row => !isActiveSyncStatus(row.job.status))) await refresh();
      } catch (err) { if (!cancelled) setError(err instanceof Error ? err.message : "อ่านความคืบหน้าไม่สำเร็จ"); }
      finally { polling = false; }
    }, 3000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [jobs, refresh]);

  async function start() {
    setBusy(true); setError("");
    try {
      const res = await apiFetch<{ results: Result[] }>("/api/distributions/repair", { method: "POST", body: JSON.stringify({ siteIds: selected, mode: overwrite ? "overwrite_editorial" : "video_only" }) });
      setResults(res.results);
      setJobs(prev => ({ ...prev, ...Object.fromEntries(res.results.filter(row => row.job).map(row => [row.siteId, row.job!])) }));
      setSelected([]);
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "เริ่มซ่อมไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  async function cancel(job: PublicSyncJob) {
    try {
      const res = await apiFetch<{ job: PublicSyncJob }>(`/api/sites/sync-jobs/${job.id}/cancel`, { method: "POST" });
      setJobs(prev => ({ ...prev, [job.siteId]: res.job }));
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "ยกเลิกไม่สำเร็จ"); }
  }
  const selectable = overview?.sites.filter(site => site.isActive && site.eligible > 0 && (!site.job || !isActiveSyncStatus(site.job.status))) ?? [];
  const count = selectable.filter(site => selected.includes(site.id)).reduce((sum, site) => sum + Math.min(site.eligible, overview!.limitPerSite), 0);
  return <section>
    <div className="page-head"><h1><span className="g">ซ่อมงานเผยแพร่</span></h1><p>ส่งซ้ำเฉพาะงานที่ล้มเหลว ทีละวิดีโอต่อเว็บไซต์ ติดตามงานต่อได้แม้ปิดหน้านี้</p></div>
    {error && <p role="alert" className="sync-job-error">{error}</p>}
    <div className="panel">
      <p>เลือกเว็บที่ต้องการซ่อม ระบบตรวจโพสต์เดิมก่อนส่งซ้ำ รายการที่สำเร็จแล้วจะถูกข้าม ร่างและวิดีโอที่ตีกลับจะไม่ถูกเผยแพร่จากหน้านี้</p>
      <p>เมื่อสร้างโพสต์ใหม่ ระบบใช้ชื่อและเนื้อหาหลักจาก AURUM งานที่ยังผิดพลาดจะเก็บเหตุผลไว้ให้ตรวจต่อ</p>
      <label style={{ display: "block", margin: "16px 0" }}><input type="checkbox" checked={overwrite} onChange={event => setOverwrite(event.target.checked)} disabled={busy} /> ส่งชื่อและเนื้อหาจาก AURUM ทับโพสต์เดิมด้วย</label>
      {overwrite && <p className="sync-job-error">ใช้เมื่อข้อมูลเผยแพร่ครั้งก่อนเสียหาย การแก้ชื่อและเนื้อหาบน WordPress จะถูกแทนที่ด้วยข้อมูลของ AURUM</p>}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "16px 0" }}>
        <button className="btn-ghost" onClick={() => setSelected(selectable.map(site => site.id))} disabled={busy || !selectable.length}>เลือกเว็บที่ซ่อมได้ทั้งหมด</button>
        <button className="btn-gold" onClick={start} disabled={busy || !count}>{busy ? "กำลังจัดคิว…" : `ซ่อมและส่งซ้ำ ${count} งาน`}</button>
        <button className="btn-ghost" onClick={() => refresh().catch(err => setError(err.message))} disabled={busy}>รีเฟรช</button>
        <Link className="btn-ghost" href="/admin/sites">ตรวจการเชื่อมต่อเว็บไซต์</Link>
      </div>
      {!overview ? <p>กำลังตรวจงาน…</p> : <div style={{ overflowX: "auto" }}><table className="dtable"><thead><tr><th>เลือก</th><th>เว็บไซต์</th><th>ล้มเหลว</th><th>ซ่อมได้</th><th>การเชื่อมต่อ</th></tr></thead><tbody>
        {overview.sites.filter(site => site.failed > 0 || site.job).map(site => <tr key={site.id}>
          <td><input aria-label={`เลือก ${site.name}`} type="checkbox" checked={selected.includes(site.id)} disabled={busy || !selectable.some(row => row.id === site.id)} onChange={event => setSelected(prev => event.target.checked ? [...prev, site.id] : prev.filter(id => id !== site.id))} /></td>
          <td>{site.name}{!site.isActive && " (ปิดใช้งาน)"}{site.failed > site.eligible && <small style={{ display: "block" }}>{site.failed - site.eligible} งานต้องตรวจสถานะวิดีโอก่อน</small>}</td><td>{site.failed}</td><td>{site.eligible}</td><td>{site.healthStatus}</td>
        </tr>)}
        {!overview.sites.some(site => site.failed > 0 || site.job) && <tr><td colSpan={5}>ไม่มีงานเผยแพร่ที่ล้มเหลว</td></tr>}
      </tbody></table></div>}
      {overview && <p>จัดคิวได้สูงสุด {overview.limitPerSite} งานต่อเว็บต่อครั้ง เว็บที่มีคิวทำงานอยู่จะรอให้คิวเดิมเสร็จก่อน</p>}
      <div role="status">{results.map(row => <p key={row.siteId}>{overview?.sites.find(site => site.id === row.siteId)?.name ?? row.siteId}: {row.created ? `จัดคิวซ่อม ${row.queued} งานแล้ว` : row.error === "site_job_already_active" ? "มีคิวเดิมกำลังทำงานอยู่" : row.error === "site_inactive" ? "เว็บไซต์ปิดใช้งาน" : row.error ? `เริ่มซ่อมไม่สำเร็จ (${row.error})` : "ไม่มีงานที่ต้องส่งซ้ำ"}</p>)}</div>
    </div>
    {Object.values(jobs).map(job => <div className="panel" key={job.id}>
      <h3>{overview?.sites.find(site => site.id === job.siteId)?.name ?? job.siteId} — {phaseLabelTh(job.phase)}</h3>
      <progress max={100} value={job.progress} aria-label="ความคืบหน้า" style={{ width: "100%" }} />
      <p>{job.progress}% · ส่งสำเร็จ {job.successCount} · ล้มเหลว {job.failedCount} · ข้าม {job.skippedMovies} · ดำเนินการ {job.processedMovies}/{job.queuedMovies}</p>
      {job.errorMessage && <p className="sync-job-error">{job.errorMessage}</p>}
      {isActiveSyncStatus(job.status) && <button className="btn-ghost" onClick={() => cancel(job)}>ยกเลิกงานที่เหลือ</button>}
      <Link className="btn-ghost" href="/admin/sites">ดูบันทึกงานทั้งหมด</Link>
      {logs[job.id]?.map(log => <p key={log.id}><span className={`badge ${log.level === "ERROR" ? "bad" : log.level === "WARN" ? "warn" : "neutral"}`}>{log.level}</span> {log.message}</p>)}
    </div>)}
  </section>;
}
