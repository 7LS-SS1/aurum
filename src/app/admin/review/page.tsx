import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import s from "@/components/admin/Ops.module.css";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "READY_FOR_REVIEW", label: "รอตรวจสอบ" },
  { key: "IN_REVIEW", label: "กำลังตรวจ" },
  { key: "READY_FOR_APPROVAL", label: "รออนุมัติเผยแพร่" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const SOURCES = { scan: "สแกนแหล่ง", all: "ทุกแหล่ง", auto: "ดาวน์โหลดอัตโนมัติ", api: "API นำเข้า", manual: "เพิ่มเอง" } as const;
type Source = keyof typeof SOURCES;

function sourceWhere(source: Source): Prisma.MovieWhereInput {
  if (source === "scan") return { id: { startsWith: "scan_" } };
  if (source === "auto") return { id: { startsWith: "auto_" } };
  if (source === "api") return { id: { startsWith: "ingest_" } };
  if (source === "manual") return { NOT: [{ id: { startsWith: "scan_" } }, { id: { startsWith: "auto_" } }, { id: { startsWith: "ingest_" } }] };
  return {};
}
const sourceOf = (id: string): Source => id.startsWith("scan_") ? "scan" : id.startsWith("auto_") ? "auto" : id.startsWith("ingest_") ? "api" : "manual";

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ status?: string; source?: string }> }) {
  const params = await searchParams;
  const status: Tab = TABS.some((tab) => tab.key === params.status) ? params.status as Tab : "READY_FOR_REVIEW";
  const source: Source = params.source && params.source in SOURCES ? params.source as Source : "all";
  const [counts, movies, queued, scanned] = await Promise.all([
    prisma.movie.groupBy({ by: ["status"], where: { status: { in: TABS.map((tab) => tab.key) } }, _count: true }),
    prisma.movie.findMany({
      where: { status, ...sourceWhere(source) },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, title: true, thumbnailUrl: true, mainCategory: true, createdAt: true, createdBy: { select: { name: true, email: true } }, reviewer: { select: { name: true } } },
    }),
    prisma.autoDownloadJob.count({ where: { status: { in: ["QUEUED", "DOWNLOADING"] } } }),
    prisma.movie.count({ where: { id: { startsWith: "scan_" }, status: "READY_FOR_REVIEW" } }),
  ]);
  const count = (key: string) => counts.find((row) => row.status === key)?._count ?? 0;
  const href = (next: { status?: string; source?: string }) => `/admin/review?${new URLSearchParams({ status: next.status ?? status, source: next.source ?? source })}`;

  return <>
    <div className={s.head}>
      <div><h1>รายการรอตรวจสอบ</h1><p>วิดีโอที่ดาวน์โหลดอัตโนมัติหรือนำเข้าผ่าน API จะเข้ามาที่นี่ทันทีโดยไม่ต้องอนุมัติ เปิดแต่ละรายการเพื่อตรวจ แก้ไข และส่งต่อขั้นตอนเผยแพร่</p></div>
      <div className={s.headActions}><Link className="ui-button" href="/admin/auto-download">ดาวน์โหลดอัตโนมัติ{queued ? ` · ${queued} ในคิว` : ""}</Link><Link className="ui-button" href="/admin/videos">วิดีโอทั้งหมด</Link></div>
    </div>

    <div className={s.stats}>
      <Link className={s.stat} href="/admin/review?source=scan"><small>สแกนแหล่ง · รอตรวจสอบ</small><strong>{scanned}</strong></Link>
      {TABS.map((tab) => <Link key={tab.key} href={href({ status: tab.key })} className={s.stat} aria-current={tab.key === status ? "page" : undefined} style={tab.key === status ? { borderColor: "var(--accent)" } : undefined}><small>{tab.label}</small><strong>{count(tab.key)}</strong></Link>)}
      <Link href="/admin/auto-download" className={s.stat}><small>กำลังดาวน์โหลด / รอคิว</small><strong>{queued}</strong></Link>
    </div>

    <section className={s.card}>
      <div className={s.cardHead}>
        <h2>{TABS.find((tab) => tab.key === status)!.label} <span className={s.meta}>· {movies.length}{movies.length === 100 ? "+" : ""} รายการ</span></h2>
        <nav className={s.tabs} aria-label="แหล่งที่มา">{(Object.keys(SOURCES) as Source[]).map((key) => <Link key={key} href={href({ source: key })} className={`${s.tab} ${key === source ? s.tabActive : ""}`}>{SOURCES[key]}</Link>)}</nav>
      </div>
      {movies.length === 0 ? <div className={s.empty}><strong>ไม่มีรายการในสถานะนี้</strong>เมื่อมีวิดีโอใหม่จากการดาวน์โหลดอัตโนมัติ จะแสดงที่นี่</div> :
        <div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>วิดีโอ</th><th>แหล่งที่มา</th><th>หมวดหมู่หลัก</th><th>ผู้ตรวจ</th><th>เข้าระบบเมื่อ</th><th /></tr></thead>
          <tbody>{movies.map((movie) => <tr key={movie.id}>
            <td><div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {movie.thumbnailUrl ? <img className={s.thumb} src={movie.thumbnailUrl} alt="" loading="lazy" /> : <span className={s.thumb} />}
              <div><Link className={s.title} href={`/admin/videos/${movie.id}`}>{movie.title}</Link><div className={s.meta}>{movie.createdBy?.name || movie.createdBy?.email || "ระบบอัตโนมัติ"}</div></div>
            </div></td>
            <td><span className={`${s.badge} ${s.REVIEW}`}>{SOURCES[sourceOf(movie.id)]}</span></td>
            <td className={s.meta}>{movie.mainCategory || "—"}</td>
            <td className={s.meta}>{movie.reviewer?.name || "—"}</td>
            <td className={s.meta}>{movie.createdAt.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</td>
            <td><div className={s.rowActions}><Link className={`ui-button ${s.small}`} href={`/admin/videos/${movie.id}/preview`}>ดูตัวอย่าง</Link><Link className={`ui-button ui-button--primary ${s.small}`} href={`/admin/videos/${movie.id}`}>ตรวจสอบ</Link></div></td>
          </tr>)}</tbody>
        </table></div>}
    </section>
  </>;
}
