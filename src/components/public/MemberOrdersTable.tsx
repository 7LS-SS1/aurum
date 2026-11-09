"use client";
import { Fragment, useState, type ReactNode } from "react";
import { simulationLabel, type Simulation } from "@/lib/ads-simulation";
import { statusLabels } from "@/lib/ads-booking";
import { filterMemberOrders, type OrderDateField, type OrderFilter } from "@/lib/member-order-filter";
import s from "./MemberOrdersTable.module.css";

export type MemberOrder = { promptpay?: { environment: string } | null; simulation: Simulation | null; id: string; createdAt: string; status: string; amount: number; days: number; quote: { items: string[] }; staffNote: string; paymentUrl: string | null; startsAt: string | null; endsAt: string | null; holdUntil: string | null };
const emptyFilter: OrderFilter = { query: "", from: "", to: "", dateField: "createdAt" };
const date = (value: string | null) => value ? new Date(value).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric" }) : "ยังไม่เริ่ม";
const pageSize = 10;

export function MemberOrdersTable({ orders, renderDetails, compact = false }: { orders: MemberOrder[]; renderDetails: (order: MemberOrder) => ReactNode; compact?: boolean }) {
  const [filter, setFilter] = useState(emptyFilter), [page, setPage] = useState(1), [expanded, setExpanded] = useState<string | null>(null);
  const filtered = filterMemberOrders(orders, filter);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)), currentPage = Math.min(page, pages);
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const invalidRange = !!filter.from && !!filter.to && filter.from > filter.to;
  const hasFilter = !!(filter.query || filter.from || filter.to);
  function update(values: Partial<OrderFilter>) { setFilter(previous => ({ ...previous, ...values })); setPage(1); setExpanded(null); }
  function reset() { setFilter(emptyFilter); setPage(1); setExpanded(null); }
  return <section className={s.root} aria-label="รายการคำสั่งซื้อของฉัน">
    {!compact && <div className={s.filters} role="search" aria-label="ค้นหาคำสั่งซื้อ">
      <label className={s.search}>ค้นหาคำสั่งซื้อ<div className={s.searchField}><span aria-hidden="true">⌕</span><input type="search" value={filter.query} onChange={event => update({ query: event.target.value })} placeholder="เลขคำสั่งซื้อ / เว็บไซต์ / ตำแหน่งโฆษณา" autoComplete="off" /></div></label>
      <label>ค้นหาตามวันที่<select value={filter.dateField} onChange={event => update({ dateField: event.target.value as OrderDateField })}><option value="createdAt">วันที่สั่งซื้อ</option><option value="startsAt">วันเริ่มสัญญา</option><option value="endsAt">วันสิ้นสุดสัญญา</option></select></label>
      <label>ตั้งแต่วันที่<input type="date" value={filter.from} max={filter.to || undefined} aria-invalid={invalidRange || undefined} aria-describedby={invalidRange ? "member-order-date-error" : undefined} onChange={event => update({ from: event.target.value })} /></label>
      <label>ถึงวันที่<input type="date" value={filter.to} min={filter.from || undefined} aria-invalid={invalidRange || undefined} aria-describedby={invalidRange ? "member-order-date-error" : undefined} onChange={event => update({ to: event.target.value })} /></label>
      <button type="button" className={s.reset} disabled={!hasFilter && filter.dateField === "createdAt"} onClick={reset}>ล้างตัวกรอง</button>
      <p className={s.hint}>กรองวันที่ตามเวลาประเทศไทย · เลือกวันเดียวกันทั้งสองช่องเพื่อค้นหารายวัน</p>
      {invalidRange && <p className={s.error} id="member-order-date-error" role="alert">วันที่เริ่มค้นหาต้องไม่เกินวันที่สิ้นสุด</p>}
    </div>}
    <div className={s.toolbar}><p role="status" aria-live="polite">{hasFilter ? "พบ" : "ทั้งหมด"} <strong>{filtered.length.toLocaleString("th-TH")}</strong> รายการ{hasFilter && ` จาก ${orders.length.toLocaleString("th-TH")} รายการ`}</p><span>เรียงจากวันที่สั่งซื้อล่าสุด</span></div>
    <p className={s.mobileHint}>เลื่อนตารางซ้าย–ขวาเพื่อดูข้อมูลทั้งหมด</p>
    <div className={s.scroll} role="region" aria-label="ตารางคำสั่งซื้อ เลื่อนแนวนอนได้" tabIndex={0}>
      <table className={s.table}><caption className={s.srOnly}>คำสั่งซื้อ สถานะ ยอดชำระ และระยะสัญญา</caption><thead><tr><th scope="col">คำสั่งซื้อ / วันที่</th><th scope="col">บริการที่จอง</th><th scope="col">สถานะ</th><th scope="col" className={s.amount}>ยอดรวม</th><th scope="col">ระยะสัญญา</th><th scope="col"><span className={s.srOnly}>รายละเอียด</span></th></tr></thead><tbody>
        {rows.map(order => <Fragment key={order.id}><tr className={expanded === order.id ? s.selected : undefined}>
          <th scope="row"><span className={s.number}>#{order.id}</span><span className={s.sub}>{date(order.createdAt)}</span>{(order.simulation || order.promptpay) && <span className={s.demo}>DEMO · ทดสอบ</span>}</th>
          <td><span className={s.service} title={order.quote.items.join(" · ")}>{order.quote.items.join(" · ")}</span><span className={s.sub}>{order.days} วัน</span></td>
          <td><span className={s.status} data-status={order.status}>{simulationLabel(order.status, order.simulation) || statusLabels[order.status] || order.status}</span></td>
          <td className={s.amount}><strong>฿{order.amount.toLocaleString("th-TH")}</strong></td>
          <td><span className={s.contract}>{order.startsAt ? <>{date(order.startsAt)}<span className={s.sub}>ถึง {date(order.endsAt)}</span></> : <span className={s.sub}>รออนุมัติเริ่มบริการ</span>}</span></td>
          <td><button type="button" className={s.detailButton} aria-expanded={expanded === order.id} aria-controls={`order-detail-${order.id}`} aria-label={`${expanded === order.id ? "ปิด" : "ดู"}รายละเอียดคำสั่งซื้อ ${order.id}`} onClick={() => setExpanded(expanded === order.id ? null : order.id)}>{expanded === order.id ? "ปิดรายละเอียด −" : "ดูรายละเอียด ↗"}</button></td>
        </tr>{expanded === order.id && <tr className={s.detailRow}><td colSpan={6}><div id={`order-detail-${order.id}`} className={s.detail}>{renderDetails(order)}</div></td></tr>}</Fragment>)}
        {!rows.length && <tr><td colSpan={6}><div className={s.empty}><strong>{invalidRange ? "กรุณาตรวจสอบช่วงวันที่" : "ไม่พบคำสั่งซื้อที่ตรงกับการค้นหา"}</strong><p>ลองเปลี่ยนคำค้นหรือช่วงวันที่ แล้วค้นหาอีกครั้ง</p><button type="button" className={s.detailButton} onClick={reset}>แสดงรายการทั้งหมด</button></div></td></tr>}
      </tbody></table>
    </div>
    {filtered.length > pageSize && <nav className={s.pagination} aria-label="แบ่งหน้าคำสั่งซื้อ"><span>แสดง {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} จาก {filtered.length} รายการ</span><div><button type="button" disabled={currentPage === 1} onClick={() => { setPage(currentPage - 1); setExpanded(null); }}>← ก่อนหน้า</button><span>หน้า {currentPage} / {pages}</span><button type="button" disabled={currentPage === pages} onClick={() => { setPage(currentPage + 1); setExpanded(null); }}>ถัดไป →</button></div></nav>}
  </section>;
}
