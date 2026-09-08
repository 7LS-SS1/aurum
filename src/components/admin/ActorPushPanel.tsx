"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api-client";

type ActorRow = { id: string; name: string };
type SyncMode = "upsert" | "create_only";
type Result = { actorId: string; name: string; status: string; message?: string };
type ActorPage = { actors: ActorRow[]; pagination: { totalPages: number } };

const labels: Record<string, string> = {
  queued: "รอส่ง", sending: "กำลังส่ง", created: "เพิ่มสำเร็จ", updated: "อัปเดตข้อมูลสำเร็จ",
  skipped: "ข้อมูลตรงกันแล้ว", existing: "มีอยู่แล้ว — ไม่แก้ไข", image_updated: "อัปเดตรูปภาพสำเร็จ",
  image_removed: "นำรูปภาพออกสำเร็จ", failed: "ล้มเหลว", cancelled: "หยุดก่อนส่ง",
};

export function ActorPushPanel({ actors, sites, totalActors, disabled = false, onBusyChange }: {
  actors: ActorRow[]; sites: ActorRow[]; totalActors: number; disabled?: boolean; onBusyChange?: (busy: boolean) => void;
}) {
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [selected, setSelected] = useState<string[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [stopping, setStopping] = useState(false);
  const inFlight = useRef(false);
  const stopRequested = useRef(false);
  const retryMode = useRef<SyncMode>("upsert");

  useEffect(() => {
    const visibleIds = new Set(actors.map(actor => actor.id));
    setSelected(previous => previous.filter(id => visibleIds.has(id)));
  }, [actors]);

  const chosen = actors.filter(actor => selected.includes(actor.id));
  const failed = results.filter(result => result.status === "failed");
  const finished = results.filter(result => !["queued", "sending"].includes(result.status)).length;
  const skipped = results.filter(result => ["skipped", "existing"].includes(result.status)).length;
  const cancelled = results.filter(result => result.status === "cancelled").length;
  const success = finished - failed.length - skipped - cancelled;

  async function loadAllActors(): Promise<ActorRow[]> {
    setLoadingAll(true);
    try {
      const first = await apiFetch<ActorPage>("/api/actors?page=1&take=100");
      const all = [...first.actors];
      for (let page = 2; page <= first.pagination.totalPages; page += 1) {
        const response = await apiFetch<ActorPage>(`/api/actors?page=${page}&take=100`);
        all.push(...response.actors);
      }
      return all;
    } finally { setLoadingAll(false); }
  }

  async function push(queue: ActorRow[], mode: SyncMode, retry = false) {
    if (inFlight.current || disabled || !siteId || !queue.length) return;
    const destination = sites.find(site => site.id === siteId)?.name ?? "เว็บไซต์ปลายทาง";
    const detail = mode === "create_only" ? "ระบบจะข้ามรายการที่มีอยู่แล้วและจะไม่แก้ไขข้อมูลเดิม" : "ข้อมูลของรายการที่มีอยู่แล้วอาจถูกอัปเดตให้ตรงกับระบบหลัก";
    if (queue.length >= 10 && !confirm(`ยืนยันดำเนินการกับนักแสดง ${queue.length.toLocaleString("th-TH")} คน ไปยัง ${destination}?\n\n${detail}`)) return;

    inFlight.current = true; retryMode.current = mode; stopRequested.current = false;
    setStopping(false); setBusy(true); onBusyChange?.(true);
    const ids = new Set(queue.map(actor => actor.id));
    const output: Result[] = [
      ...(retry ? results.filter(result => !ids.has(result.actorId)) : []),
      ...queue.map(actor => ({ actorId: actor.id, name: actor.name, status: "queued" })),
    ];
    setResults([...output]);
    const update = (id: string, result: Partial<Result>) => {
      const index = output.findIndex(item => item.actorId === id);
      if (index >= 0) output[index] = { ...output[index]!, ...result };
      setResults([...output]);
    };
    try {
      setChecking(true);
      await apiFetch("/api/actors/sync?siteId=" + encodeURIComponent(siteId), { signal: AbortSignal.timeout(50_000) });
      setChecking(false);
      for (const item of queue) {
        if (stopRequested.current) { update(item.id, { status: "cancelled" }); continue; }
        update(item.id, { status: "sending" });
        try {
          const response = await apiFetch<{ results: Result[] }>("/api/actors/sync", {
            method: "POST", body: JSON.stringify({ siteId, actorIds: [item.id], mode }), signal: AbortSignal.timeout(100_000),
          });
          const result = response.results.find(entry => entry.actorId === item.id);
          if (!result) throw new Error("missing_result");
          update(item.id, { status: result.status, message: result.message });
        } catch (error) {
          update(item.id, { status: "failed", message: error instanceof ApiClientError ? error.message : "การเชื่อมต่อขาดหรือหมดเวลา สามารถลองใหม่ได้" });
        }
        if (item !== queue[queue.length - 1] && !stopRequested.current) await new Promise(resolve => setTimeout(resolve, 1100));
      }
    } catch (error) {
      const message = error instanceof ApiClientError ? error.message : "ตรวจปลายทางไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองใหม่";
      for (const item of queue) update(item.id, { status: "failed", message });
    } finally {
      inFlight.current = false; setChecking(false); setBusy(false); onBusyChange?.(false);
    }
  }

  async function pushAll(mode: SyncMode) {
    if (busy || loadingAll || disabled || !siteId) return;
    try { await push(await loadAllActors(), mode); }
    catch (error) {
      setResults([{ actorId: "load", name: "โหลดรายชื่อนักแสดง", status: "failed", message: error instanceof ApiClientError ? error.message : "โหลดรายชื่อทั้งหมดไม่สำเร็จ" }]);
    }
  }

  return <section className="actor-sync" aria-busy={busy || loadingAll}>
    <div className="actor-sync__heading">
      <div><span className="actor-sync__eyebrow">WORDPRESS SYNC</span><h4>ส่งข้อมูลนักแสดงไปเว็บไซต์ปลายทาง</h4><p>เลือกวิธีส่งที่เหมาะกับงาน ระบบจะตรวจสอบความพร้อมของปลายทางก่อนเริ่มทุกครั้ง</p></div>
      <label className="actor-sync__site"><span>เว็บไซต์ปลายทาง</span><select value={siteId} disabled={busy || loadingAll || disabled} onChange={event => { setSiteId(event.target.value); setResults([]); }}>
        {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
      </select></label>
    </div>
    {!sites.length && <div className="actor-sync__notice">ยังไม่มีเว็บไซต์ปลายทางที่เปิดใช้งาน</div>}
    <div className="actor-sync__actions">
      <button className="actor-sync-card" disabled={busy || loadingAll || disabled || !siteId || !chosen.length} onClick={() => push(chosen, "upsert")}>
        <span className="actor-sync-card__icon">✓</span><span><strong>ส่งรายการที่เลือก</strong><small>อัปเดต {chosen.length.toLocaleString("th-TH")} รายการในหน้านี้</small></span>
      </button>
      <button className="actor-sync-card" disabled={busy || loadingAll || disabled || !siteId || !totalActors} onClick={() => pushAll("upsert")}>
        <span className="actor-sync-card__icon">↻</span><span><strong>เพิ่มนักแสดงทั้งหมดที่มี</strong><small>ส่งครบ {totalActors.toLocaleString("th-TH")} คน และอัปเดตข้อมูลเดิม</small></span>
      </button>
      <button className="actor-sync-card actor-sync-card--safe" disabled={busy || loadingAll || disabled || !siteId || !totalActors} onClick={() => pushAll("create_only")}>
        <span className="actor-sync-card__icon">＋</span><span><strong>เพิ่มเฉพาะนักแสดงใหม่</strong><small>ข้ามรายการเดิมโดยไม่เขียนทับข้อมูลในเว็บนั้น</small></span>
      </button>
    </div>
    <div className="actor-sync__selection">
      <div className="actor-sync__selection-head"><label><input type="checkbox" disabled={busy || loadingAll || disabled || !actors.length} checked={actors.length > 0 && chosen.length === actors.length}
        onChange={event => setSelected(event.target.checked ? actors.map(actor => actor.id) : [])} /> เลือกทั้งหมดในหน้านี้</label><span>{chosen.length.toLocaleString("th-TH")} / {actors.length.toLocaleString("th-TH")} รายการ</span></div>
      <div className="actor-sync__chips">{actors.map(actor => <label key={actor.id} className={selected.includes(actor.id) ? "is-selected" : ""}>
        <input type="checkbox" disabled={busy || loadingAll || disabled} checked={selected.includes(actor.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, actor.id] : previous.filter(id => id !== actor.id))} /><span>{actor.name}</span>
      </label>)}</div>
    </div>
    {(busy || loadingAll) && <div className="actor-sync__running">{loadingAll ? "กำลังโหลดรายชื่อนักแสดงทั้งหมด…" : checking ? "กำลังตรวจปลายทาง…" : "กำลังส่งข้อมูล…"}</div>}
    <div className="actor-sync__controls">
      {!busy && failed.some(item => item.actorId !== "load") && <button className="btn btn-ghost" disabled={disabled || loadingAll || !siteId} onClick={() => push(failed.filter(item => item.actorId !== "load").map(item => ({ id: item.actorId, name: item.name })), retryMode.current, true)}>ลองใหม่เฉพาะที่ล้มเหลว ({failed.length})</button>}
      {busy && <button className="btn btn-ghost" disabled={stopping} onClick={() => { stopRequested.current = true; setStopping(true); }}>{stopping ? "กำลังรอรายการปัจจุบันจบ…" : "หยุดรายการที่เหลือ"}</button>}
    </div>
    {results.length > 0 && <div className="actor-sync__results" role="status" aria-live="polite">
      <div className="actor-sync__progress"><span>ดำเนินการ {finished.toLocaleString("th-TH")} / {results.length.toLocaleString("th-TH")}</span><span>{Math.round((finished / results.length) * 100)}%</span></div>
      <progress aria-label="ความคืบหน้าการส่งนักแสดง" value={finished} max={results.length} />
      <div className="actor-sync__result-list">{results.map(result => <p key={result.actorId}><strong>{result.name}</strong><span>{labels[result.status] ?? result.status}{result.message ? " — " + result.message : ""}</span></p>)}</div>
      {!busy && <div className="actor-sync__summary">สำเร็จ {success} · ข้าม {skipped} · ล้มเหลว {failed.length} · หยุด {cancelled}</div>}
    </div>}
    {busy && <p className="actor-sync__hint">กรุณาเปิดหน้านี้ไว้จนเสร็จ ปุ่มหยุดจะรอรายการปัจจุบันจบก่อน</p>}
  </section>;
}
