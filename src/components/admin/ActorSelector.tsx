"use client";

import { useId, useState } from "react";

export function ActorSelector({ actors, selectedIds, onChange, disabled = false }: {
  actors: { id: string; name: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const selected = new Set(selectedIds);
  const count = actors.filter(actor => selected.has(actor.id)).length;
  const visible = actors.filter(actor => actor.name.normalize("NFKC").toLocaleLowerCase().includes(query.normalize("NFKC").trim().toLocaleLowerCase()));

  return <fieldset className="actor-selector" disabled={disabled}>
    <legend>นักแสดง</legend>
    <div className="actor-selector-heading">
      <div><strong>เพิ่มนักแสดงให้วิดีโอ</strong><p>เลือกได้หลายคน หรือเพิ่มนักแสดงทั้งหมดในครั้งเดียว</p></div>
      <span className="actor-selector-count" role="status">เลือกแล้ว {count} / {actors.length} คน</span>
    </div>
    <div className="actor-selector-toolbar">
      <div className="actor-selector-search"><label htmlFor={searchId}>ค้นหานักแสดง</label><input id={searchId} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="พิมพ์ชื่อนักแสดง…" /></div>
      <button type="button" className="btn btn-gold" disabled={!actors.length || count === actors.length} onClick={() => onChange([...new Set([...selectedIds, ...actors.map(actor => actor.id)])])}>เพิ่มนักแสดงทั้งหมด</button>
      <button type="button" className="btn btn-ghost" disabled={!selectedIds.length} onClick={() => onChange([])}>ล้างที่เลือก</button>
    </div>
    {query.trim() && <p className="actor-selector-hint">พบ {visible.length} คน · ปุ่มเพิ่มทั้งหมดจะเลือกทุกคน รวมถึงคนที่ไม่อยู่ในผลค้นหา</p>}
    <div className="actor-selector-grid">
      {visible.map(actor => <label className={`actor-selector-option${selected.has(actor.id) ? " is-selected" : ""}`} key={actor.id}>
        <input type="checkbox" checked={selected.has(actor.id)} onChange={event => onChange(event.target.checked ? [...new Set([...selectedIds, actor.id])] : selectedIds.filter(id => id !== actor.id))} />
        <span className="actor-selector-avatar" aria-hidden="true">{Array.from(actor.name.trim())[0] || "•"}</span>
        <span className="actor-selector-name">{actor.name}</span>
      </label>)}
    </div>
    {!visible.length && <p className="actor-selector-empty">{actors.length ? "ไม่พบนักแสดงที่ตรงกับคำค้นหา" : "ยังไม่มีนักแสดงในระบบ กรุณาเพิ่มนักแสดงก่อน"}</p>}
  </fieldset>;
}
