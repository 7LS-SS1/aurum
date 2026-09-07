"use client";

import { useRef, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api-client";

type Result = { actorId: string; status: string; message?: string };
const labels: Record<string, string> = {
  sending: "กำลังส่ง", created: "ส่งสำเร็จ", updated: "อัปเดตข้อมูลสำเร็จ",
  skipped: "ข้ามเนื่องจากข้อมูลเหมือนเดิม", image_updated: "อัปเดตรูปภาพสำเร็จ",
  image_removed: "นำรูปภาพออกสำเร็จ", failed: "ล้มเหลว",
};
export function ActorPushPanel({ actors, sites }: {
  actors: { id: string; name: string }[]; sites: { id: string; name: string }[];
}) {
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [selected, setSelected] = useState<string[]>([]);
  const [results, setResults] = useState<(Result & { name: string })[]>([]);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [summary, setSummary] = useState("");
  const visibleIds = new Set(actors.map(a => a.id));
  const chosen = selected.filter(id => visibleIds.has(id));

  async function push() {
    if (inFlight.current || !siteId || !chosen.length) return;
    if (chosen.length >= 10 && !confirm("ยืนยันส่งนักแสดง " + chosen.length + " คน ไปยัง " + sites.find(s => s.id === siteId)?.name + "?")) return;
    inFlight.current = true;
    setBusy(true);
    setSummary("");
    const queue = actors.filter(a => chosen.includes(a.id));
    const completed: (Result & { name: string })[] = [];
    setResults([]);
    try {
      for (const item of queue) {
        setResults([...completed, { actorId: item.id, name: item.name, status: "sending" }]);
        let result: Result;
        try {
          const response = await apiFetch<{ results: Result[] }>("/api/actors/sync", {
            method: "POST", body: JSON.stringify({ siteId, actorIds: [item.id] }),
            signal: AbortSignal.timeout(100_000),
          });
          result = response.results[0] ?? { actorId: item.id, status: "failed", message: "ไม่ได้รับผลจากเซิร์ฟเวอร์" };
        } catch (error) {
          result = { actorId: item.id, status: "failed", message: error instanceof ApiClientError ? error.message : "การเชื่อมต่อขาดหรือหมดเวลา สามารถลองใหม่ได้" };
        }
        completed.push({ ...result, name: item.name });
        setResults([...completed]);
        // Keep sustained browser batches under the per-minute destination limit.
        if (completed.length < queue.length) await new Promise(resolve => setTimeout(resolve, 1100));
      }
      const skipped = completed.filter(r => r.status === "skipped").length;
      const failed = completed.filter(r => r.status === "failed").length;
      setSummary("สำเร็จ " + (completed.length - skipped - failed) + " · ข้าม " + skipped + " · ล้มเหลว " + failed);
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <div style={{ padding: 12 }}>
    <h4>ส่งข้อมูลนักแสดงไปเว็บไซต์ปลายทาง</h4>
    <p className="sub">เลือกรายการในหน้านี้ รูปภาพใช้ URL จากระบบหลัก เว็บไซต์ต้องติดตั้ง AURUM Video Core รุ่นที่รองรับนักแสดง</p>
    <label>เว็บไซต์ปลายทาง <select value={siteId} disabled={busy} onChange={e => { setSiteId(e.target.value); setResults([]); setSummary(""); }}>
      {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
    </select></label>
    {!sites.length && <p>ยังไม่มีเว็บไซต์ปลายทางที่เปิดใช้งาน</p>}
    <div><label><input type="checkbox" disabled={busy || !actors.length}
      checked={actors.length > 0 && chosen.length === actors.length}
      onChange={e => setSelected(e.target.checked ? actors.map(a => a.id) : [])} /> เลือกทั้งหมดในหน้านี้</label></div>
    {actors.map(actor => <label key={actor.id} style={{ display: "inline-block", margin: 8 }}>
      <input type="checkbox" disabled={busy} checked={chosen.includes(actor.id)}
        onChange={e => setSelected(previous => e.target.checked ? [...previous, actor.id] : previous.filter(id => id !== actor.id))} /> {actor.name}
    </label>)}
    <div><button className="btn btn-primary" disabled={busy || !siteId || !chosen.length} onClick={push}>
      {busy ? "กำลังส่ง…" : "Push นักแสดงที่เลือก (" + chosen.length + ")"}
    </button></div>
    <div role="status" aria-live="polite">
      {results.map(result => <p key={result.actorId}>{result.name}: {labels[result.status] ?? result.status}{result.message ? " — " + result.message : ""}</p>)}
      {summary && <strong>{summary}</strong>}
    </div>
    {busy && <p>กรุณาเปิดหน้านี้ไว้จนเสร็จ หากปิดหน้าสามารถเลือกและส่งใหม่ได้โดยไม่สร้างรายการซ้ำ</p>}
  </div>;
}
