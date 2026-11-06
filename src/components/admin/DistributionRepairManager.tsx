"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { isActiveSyncStatus, phaseLabelTh, type PublicSyncJob, type SyncJobLog } from "./site-sync/types";
import styles from "./DistributionRepairManager.module.css";

interface RepairSite { id: string; name: string; isActive: boolean; healthStatus: string; failed: number; eligible: number; job: PublicSyncJob | null }
interface Overview { sites: RepairSite[]; limitPerSite: number }
interface Result { siteId: string; created: boolean; queued: number; error: string | null; job: PublicSyncJob | null }
const clock = (value: string | number) => new Date(value).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
function duration(ms: number) { const seconds = Math.max(0, Math.floor(ms / 1000)); return seconds >= 3600 ? `${Math.floor(seconds / 3600)} ชม. ${Math.floor(seconds % 3600 / 60)} นาที` : `${Math.floor(seconds / 60)} นาที ${seconds % 60} วินาที`; }
const message = (err: unknown) => err instanceof Error ? err.message : "ไม่สามารถอ่านข้อมูลได้ กรุณาลองใหม่";

export function DistributionRepairManager() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [jobs, setJobs] = useState<Record<string, PublicSyncJob>>({});
  const [logs, setLogs] = useState<Record<string, SyncJobLog[]>>({});
  const [pollErrors, setPollErrors] = useState<Record<string, string>>({});
  const [updated, setUpdated] = useState<Record<string, number>>({});
  const [now, setNow] = useState(0);
  const [search, setSearch] = useState("");
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [focusedJob, setFocusedJob] = useState<string | null>(null);
  const monitor = useRef<HTMLDivElement>(null);
  const afterIds = useRef<Record<string, string>>({});
  const drained = useRef<Record<string, boolean>>({});
  const jobsRef = useRef(jobs);
  useEffect(() => { jobsRef.current = jobs; }, [jobs]);
  const refresh = useCallback(async () => {
    const data = await apiFetch<Overview>("/api/distributions/repair", { cache: "no-store" });
    setOverview(data);
    setJobs(prev => ({ ...prev, ...Object.fromEntries(data.sites.filter(site => site.job).map(site => [site.id, site.job!])) }));
  }, []);
  useEffect(() => { refresh().catch(err => setError(message(err))); }, [refresh]);
  const jobIds = Object.values(jobs).map(job => job.id).sort().join(",");
  useEffect(() => {
    if (!jobIds) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      const pending = Object.values(jobsRef.current).filter(job => isActiveSyncStatus(job.status) || !drained.current[job.id]);
      let finished = false;
      // Keep a slow/unavailable site independent and bound read traffic.
      for (let i = 0; i < pending.length && !cancelled; i += 3) {
        await Promise.all(pending.slice(i, i + 3).map(async job => {
          try {
            const afterId = afterIds.current[job.id];
            const row = await apiFetch<{ job: PublicSyncJob; logs: SyncJobLog[] }>(`/api/sites/sync-jobs/${job.id}?limit=200${afterId ? `&afterId=${encodeURIComponent(afterId)}` : ""}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
            if (cancelled) return;
            const last = row.logs.at(-1);
            if (last) afterIds.current[job.id] = last.id;
            drained.current[job.id] = !isActiveSyncStatus(row.job.status) && row.logs.length < 200;
            finished ||= isActiveSyncStatus(job.status) && !isActiveSyncStatus(row.job.status);
            setJobs(prev => prev[job.siteId]?.id === job.id ? { ...prev, [job.siteId]: row.job } : prev);
            setLogs(prev => ({ ...prev, [job.id]: Array.from(new Map([...(prev[job.id] ?? []), ...row.logs].map(log => [log.id, log])).values()).slice(-200) }));
            setUpdated(prev => ({ ...prev, [job.id]: Date.now() }));
            setPollErrors(prev => ({ ...prev, [job.id]: "" }));
          } catch (err) { if (!cancelled) setPollErrors(prev => ({ ...prev, [job.id]: message(err) })); }
        }));
      }
      if (!cancelled && finished) await refresh().catch(err => setError(message(err)));
      if (!cancelled) timer = setTimeout(poll, 3000);
    }
    void poll();
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, [jobIds, refresh]);
  useEffect(() => { if (!jobIds) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [jobIds]);

  async function start() {
    if (busy) return;
    setBusy(true); setError(""); setResults([]);
    monitor.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      const res = await apiFetch<{ results: Result[] }>("/api/distributions/repair", { method: "POST", body: JSON.stringify({ siteIds: selected, mode: overwrite ? "overwrite_editorial" : "video_only" }) });
      setResults(res.results);
      setJobs(prev => ({ ...prev, ...Object.fromEntries(res.results.filter(row => row.job).map(row => [row.siteId, row.job!])) }));
      setFocusedJob(res.results.find(row => row.job)?.job?.id ?? null);
      setSelected([]);
      await refresh();
    } catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }
  async function cancel(job: PublicSyncJob) {
    setCancelling(job.id);
    try {
      const res = await apiFetch<{ job: PublicSyncJob }>(`/api/sites/sync-jobs/${job.id}/cancel`, { method: "POST" });
      drained.current[job.id] = false;
      setJobs(prev => ({ ...prev, [job.siteId]: res.job }));
      await refresh();
    } catch (err) { setError(message(err)); }
    finally { setCancelling(null); }
  }
  const selectable = overview?.sites.filter(site => site.isActive && site.eligible > 0 && !(jobs[site.id] && isActiveSyncStatus(jobs[site.id]!.status))) ?? [];
  const count = selectable.filter(site => selected.includes(site.id)).reduce((sum, site) => sum + Math.min(site.eligible, overview!.limitPerSite), 0);
  const jobList = Object.values(jobs).sort((a, b) => Number(isActiveSyncStatus(b.status)) - Number(isActiveSyncStatus(a.status)) || b.createdAt.localeCompare(a.createdAt));
  const current = jobList.find(job => job.id === focusedJob) ?? jobList[0];
  const activeCount = jobList.filter(job => isActiveSyncStatus(job.status)).length;
  const visibleSites = overview?.sites.filter(site => (site.failed > 0 || site.job) && site.name.toLowerCase().includes(search.toLowerCase())) ?? [];
  const total = jobList.reduce((sum, job) => sum + job.queuedMovies, 0);
  const processed = jobList.reduce((sum, job) => sum + job.processedMovies, 0);
  const percent = total ? Math.min(100, Math.round(processed / total * 100)) : 0;
  const elapsed = current && now ? Math.max(0, (current.finishedAt ? Date.parse(current.finishedAt) : now) - Date.parse(current.startedAt ?? current.createdAt)) : 0;
  const stale = current && now ? now - Date.parse(current.heartbeatAt ?? current.startedAt ?? current.createdAt) > 90000 : false;
  const eta = current && isActiveSyncStatus(current.status) && current.startedAt && current.processedMovies >= 2 && !stale && !pollErrors[current.id] ? elapsed / current.processedMovies * Math.max(0, current.queuedMovies - current.processedMovies) : null;
  return <section className={styles.page}>
    <header className={styles.header}><div><span className={styles.eyebrow}>ศูนย์ดูแลงานเผยแพร่</span><h1>ซ่อมงานเผยแพร่</h1><p>ติดตามทุกเว็บไซต์ในที่เดียว ส่งซ้ำเฉพาะรายการที่ล้มเหลว พร้อมรักษาโพสต์เดิม</p></div><Link className="btn-ghost" href="/admin/sites">จัดการเว็บไซต์ ↗</Link></header>
    <div className={styles.metrics}>
      <div><span>งานที่ล้มเหลว</span><strong>{overview ? overview.sites.reduce((sum, site) => sum + site.failed, 0).toLocaleString() : "—"}</strong><small>ข้อมูลจากการตรวจล่าสุด</small></div>
      <div><span>เว็บไซต์ที่ซ่อมได้</span><strong>{overview ? selectable.length : "—"}</strong><small>เปิดใช้งานและไม่มีคิวเดิม</small></div>
      <div><span>คิวที่กำลังทำงาน</span><strong>{activeCount}</strong><small>อัปเดตสถานะทุก 3 วินาที</small></div>
    </div>
    {error && <div className={styles.error} role="alert">{error} <button className="btn-ghost" onClick={() => refresh().then(() => setError("")).catch(err => setError(message(err)))}>ลองอ่านข้อมูลใหม่</button></div>}
    <div className={styles.panel}>
      <div className={styles.sectionHead}><div><span className={styles.eyebrow}>01 · เลือกปลายทาง</span><h2>เว็บไซต์ที่ต้องซ่อม</h2></div><input className={styles.search} aria-label="ค้นหาเว็บไซต์" placeholder="ค้นหาชื่อเว็บไซต์…" value={search} onChange={event => setSearch(event.target.value)} /></div>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th><span className={styles.srOnly}>เลือก</span></th><th>เว็บไซต์</th><th>ล้มเหลว</th><th>ซ่อมได้</th><th>สถานะ</th></tr></thead><tbody>
        {!overview && <tr><td colSpan={5}>กำลังตรวจสอบรายการที่ต้องซ่อม…</td></tr>}
        {visibleSites.map(site => { const active = jobs[site.id] && isActiveSyncStatus(jobs[site.id]!.status); return <tr key={site.id} data-selected={selected.includes(site.id)}><td><input type="checkbox" aria-label={`เลือก ${site.name}`} checked={selected.includes(site.id)} disabled={busy || !selectable.some(row => row.id === site.id)} onChange={event => setSelected(prev => event.target.checked ? [...prev, site.id] : prev.filter(id => id !== site.id))} /></td><td><strong>{site.name}</strong>{site.failed > site.eligible && <small>{site.failed - site.eligible} งานต้องตรวจสถานะวิดีโอก่อน</small>}</td><td>{site.failed.toLocaleString()}</td><td>{site.eligible.toLocaleString()}</td><td><span className={styles.pill} data-tone={active ? "gold" : site.healthStatus === "OK" ? "ok" : "warn"}>{!site.isActive ? "ปิดใช้งาน" : active ? "มีคิวกำลังทำงาน" : site.healthStatus === "OK" ? "เชื่อมต่อผ่านล่าสุด" : "ควรตรวจการเชื่อมต่อ"}</span></td></tr>; })}
        {overview && !visibleSites.length && <tr><td className={styles.empty} colSpan={5}>{search ? "ไม่พบเว็บไซต์ที่ตรงกับคำค้น" : "ไม่มีงานเผยแพร่ที่ต้องซ่อมในขณะนี้"}</td></tr>}
      </tbody></table></div>
      <div className={styles.options}><div><strong>รักษาเนื้อหาเดิมเป็นค่าเริ่มต้น</strong><p>ซิงก์ข้อมูลวิดีโอ หมวดหมู่ และแท็ก โดยรักษาชื่อ เนื้อหา slug รูปปก และ SEO เดิม</p><label><input type="checkbox" checked={overwrite} disabled={busy} onChange={event => setOverwrite(event.target.checked)} /> เขียนทับชื่อและเนื้อหาด้วยข้อมูลจาก AURUM</label>{overwrite && <p className={styles.warning}>ชื่อและเนื้อหาที่แก้ไว้บน WordPress จะถูกแทนที่</p>}</div></div>
      <div className={styles.actions}><button className="btn-ghost" disabled={busy || !selectable.length} onClick={() => setSelected(selected.length ? [] : selectable.map(site => site.id))}>{selected.length ? "ล้างการเลือก" : "เลือกทั้งหมดที่ซ่อมได้"}</button><span>{selected.length} เว็บไซต์ · {count.toLocaleString()} งาน{overview && <small>สูงสุด {overview.limitPerSite} งาน / เว็บ / ครั้ง</small>}</span><button className="btn-gold" disabled={busy || !count} onClick={start}>{busy ? "กำลังจัดคิว…" : `เริ่มซ่อม ${count.toLocaleString()} งาน →`}</button></div>
    </div>
    <div className={styles.panel} ref={monitor} tabIndex={-1}>
      <div className={styles.sectionHead}><div><span className={styles.eyebrow}>02 · ติดตามการดำเนินการ</span><h2>ความคืบหน้าล่าสุด</h2></div><span className={styles.pill} data-tone={activeCount ? "gold" : "ok"}>{activeCount ? "● กำลังติดตาม" : "พร้อมติดตามงาน"}</span></div>
      {busy && <p role="status" className={styles.notice}>กำลังส่งคำขอและจัดคิวให้เว็บไซต์ที่เลือก… จะแสดงความคืบหน้าเมื่อเซิร์ฟเวอร์รับงานแล้ว</p>}
      <div role="status">{results.map(row => <p className={row.error ? styles.warning : styles.notice} key={row.siteId}>{overview?.sites.find(site => site.id === row.siteId)?.name ?? row.siteId} · {row.created ? `จัดคิว ${row.queued} งานแล้ว` : row.error === "site_job_already_active" ? "ติดตามคิวเดิมที่กำลังทำงาน" : row.error === "site_inactive" ? "เว็บไซต์ปิดใช้งาน" : row.error ? `เริ่มไม่สำเร็จ (${row.error})` : "ไม่มีงานที่ต้องส่งซ้ำ"}</p>)}</div>
      {!current ? <div className={styles.empty}><strong>เลือกเว็บไซต์แล้วกดเริ่มซ่อม</strong><p>สถานะ เปอร์เซ็นต์ และบันทึกการทำงานจะแสดงที่นี่</p></div> : <>
        <div className={styles.overall}><span>รายการที่ตรวจติดตามในหน้านี้</span><strong>{processed.toLocaleString()} / {total.toLocaleString()} งาน · {percent}%</strong><progress max={100} value={percent} aria-label="สัดส่วนงานที่ดำเนินการแล้ว" /><small>เปอร์เซ็นต์คือจำนวนที่ดำเนินการแล้ว รวมรายการที่ล้มเหลว ไม่ใช่อัตราส่งสำเร็จ</small></div>
        <div className={styles.workspace}><div className={styles.jobList} aria-label="เลือกคิวที่ต้องการติดตาม">{jobList.map(job => <button key={job.id} aria-pressed={current.id === job.id} className={styles.jobButton} onClick={() => setFocusedJob(job.id)}><strong>{overview?.sites.find(site => site.id === job.siteId)?.name ?? job.siteId}</strong><span>{phaseLabelTh(job.phase)} <b>{job.progress}%</b></span><progress value={job.progress} max={100} aria-label={`ความคืบหน้า ${job.site?.name ?? job.siteId}`} /></button>)}</div>
          <div className={styles.detail}><div className={styles.sectionHead}><div><h3>{overview?.sites.find(site => site.id === current.siteId)?.name ?? current.siteId}</h3><p>{phaseLabelTh(current.phase)}</p></div><strong className={styles.percent}>{current.progress}%</strong></div><progress max={100} value={current.progress} aria-label="ความคืบหน้าของเว็บไซต์ที่เลือก" />
            <div className={styles.counters}><span>สำเร็จ <b>{current.successCount}</b></span><span>ล้มเหลว <b>{current.failedCount}</b></span><span>ข้าม <b>{current.skippedMovies}</b></span><span>ดำเนินการ <b>{current.processedMovies}/{current.queuedMovies}</b></span></div>
            <div className={styles.timing}><span>{current.startedAt ? "ใช้เวลา" : "รอคิวมาแล้ว"}<strong>{now ? duration(elapsed) : "—"}</strong></span><span>เวลาคงเหลือโดยประมาณ<strong>{!isActiveSyncStatus(current.status) ? "สิ้นสุดการทำงาน" : eta !== null ? `ประมาณ ${duration(eta)}` : "กำลังประเมิน…"}</strong></span></div>
            {isActiveSyncStatus(current.status) && <p className={styles.hint}>เวลาประมาณจากอัตราที่ทำได้จริง อาจเปลี่ยนตามความเร็วของเว็บไซต์ปลายทาง</p>}
            {pollErrors[current.id] && <p className={styles.error} role="alert">อ่านสถานะไม่ได้: {pollErrors[current.id]} · ระบบจะลองเชื่อมต่อใหม่ ข้อมูลด้านบนเป็นสถานะล่าสุดที่อ่านได้</p>}
            {stale && isActiveSyncStatus(current.status) && <p className={styles.warning}>ยังไม่พบสัญญาณจาก worker ล่าสุด อาจกำลังรอคิวหรือรอเว็บปลายทาง หากนานผิดปกติให้ตรวจ scheduler และบันทึกเซิร์ฟเวอร์</p>}
            {current.errorMessage && <p className={styles.error}>{current.errorMessage}</p>}
            <div className={styles.logHead}><h4>บันทึกการทำงาน</h4><small>{updated[current.id] ? `อ่านล่าสุด ${clock(updated[current.id]!)}` : "กำลังอ่าน…"}</small></div><div className={styles.logs} role="region" aria-label="บันทึกการทำงานล่าสุด" tabIndex={0}>{[...(logs[current.id] ?? [])].reverse().map(log => <div className={styles.log} key={log.id}><time dateTime={log.createdAt}>{clock(log.createdAt)}</time><span className={styles.pill} data-tone={log.level === "ERROR" ? "bad" : log.level === "WARN" ? "warn" : "ok"}>{log.level}</span><p>{log.message}</p></div>)}{!logs[current.id]?.length && <p className={styles.hint}>ยังไม่มีบันทึกใหม่ · รอ worker รับงาน</p>}</div><p className={styles.hint}>ใหม่สุดอยู่ด้านบน · แสดงสูงสุด 200 รายการ · ปิดหน้านี้ได้โดยงานยังดำเนินต่อ</p>
            {isActiveSyncStatus(current.status) && <button className="btn-ghost" disabled={cancelling === current.id} onClick={() => cancel(current)}>{cancelling === current.id ? "กำลังยกเลิก…" : "ยกเลิกงานที่เหลือ"}</button>}
          </div></div>
      </>}
    </div>
  </section>;
}
