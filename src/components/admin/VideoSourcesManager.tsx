"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import s from "./Ops.module.css";
import css from "./VideoSources.module.css";

type Control = "RUN" | "PAUSE" | "STOP";
type Source = {
  id: string; name: string; baseUrl: string; allowedHosts: string[]; adapter: "AUTO" | "HTML_RECIPE" | "JSON_CATALOG";
  recipe: Record<string, string>; recipeVersion: number;
  control: Control; scanIntervalMinutes: number; requestIntervalMs: number;
  maxPagesPerRun: number; maxItemsTotal: number; maxFileBytes: number; mainCategory: string; defaultTags: string[];
  lastScanAt: string | null; updatedAt: string; scanComplete: boolean; counts: Record<string, number>; scanning?: boolean;
  pageStats?: { total: number; done: number; failed: number }; ready?: number; lastError?: string | null;
};
type Item = { id: string; title: string; pageUrl: string; state: string; bytes: number | null; attempts: number; error: string | null; movieId: string | null };
type PageRow = { id: string; url: string; state: string; terminal: boolean; attempts: number; error: string | null };
type EventRow = { id: string; code: string; message: string; at: string };
type Detail = { source: Source; pages: PageRow[]; pageTotal: number; events: EventRow[]; counts: Record<string, number> };
const labels: Record<string, string> = { PENDING: "รอ", RESOLVING: "กำลังหาสื่อ", DOWNLOADING: "กำลังดาวน์โหลด", DONE: "สำเร็จ", FAILED: "ผิดพลาด", UNSUPPORTED: "ไม่รองรับ", RUNNING: "กำลังสแกน", RUN: "ทำงาน", PAUSE: "พัก", STOP: "หยุด" };
const date = (value: string | null) => value ? new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "—";
const size = (value: number | null) => value == null ? "—" : `${(value / 1024 ** 2).toFixed(1)} MB`;
const split = (value: string) => value.split(/[,\n]/).map((v) => v.trim()).filter(Boolean);
const htmlRecipe = { videoLinks: "a.video-link", next: "a[rel=next]", terminal: "[data-last-page=true]", title: "h1", description: ".description", media: "video, a.download", iframe: "iframe.player", cover: "meta[property='og:image']", tags: ".tags a", categories: ".categories a", ads: ".ad" };
const jsonRecipe = { items: "items", id: "id", pageUrl: "pageUrl", title: "title", description: "description", mediaUrl: "mediaUrl", coverUrl: "coverUrl", tags: "tags", categories: "categories", next: "next", terminal: "terminal" };
const number = (value: number) => value.toLocaleString("th-TH");
type Worker = { sampledAt: string; freeBytes: number | null; totalBytes: number | null };
type Summary = { tasks: number; running: number; attention: number; discovered: number; ready: number; errors: number };
type ListData = { sources: Source[]; total: number; worker: Worker | null; summary: Summary };
type TaskFilter = "all" | "running" | "attention" | "idle";
type SourceMode = "AUTO" | "STANDARD_JSON" | "JSON_CATALOG" | "HTML_RECIPE";
type TestResult = { discovered: number; terminal: boolean; next: string | null; first: { title: string; mediaUrl: string } | null; links: string[]; error: string | null };

function SourceForm({ initial, onCancel, onSaved }: { initial?: Source; onCancel?: () => void; onSaved?: (source: Source) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<TestResult | null>(null);
  const [format, setFormat] = useState<SourceMode>(() => {
    if (!initial) return "AUTO";
    return initial.adapter === "JSON_CATALOG" && !Object.keys(initial.recipe).length ? "STANDARD_JSON" : initial.adapter;
  });
  const [recipes, setRecipes] = useState(() => ({
    HTML_RECIPE: JSON.stringify(initial?.adapter === "HTML_RECIPE" ? initial.recipe : htmlRecipe, null, 2),
    JSON_CATALOG: JSON.stringify(initial?.adapter === "JSON_CATALOG" && Object.keys(initial.recipe).length ? initial.recipe : jsonRecipe, null, 2),
  }));
  const configurable = format === "HTML_RECIPE" || format === "JSON_CATALOG" ? format : null;
  const heading = initial ? "แก้ไขแหล่งข้อมูล" : "เพิ่ม Task เว็บไซต์ใหม่";
  const returnUrl = initial ? `/admin/video-sources/${initial.id}` : "/admin/video-sources";
  async function submit(form: HTMLFormElement, testing: boolean) {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const fields = new FormData(form);
      const read = (key: string) => String(fields.get(key) ?? "");
      let recipe: unknown;
      try { recipe = configurable ? JSON.parse(recipes[configurable]) : undefined; }
      catch { throw new Error("Recipe ต้องเป็น JSON ที่ถูกต้อง"); }
      const data = {
        name: read("name"), baseUrl: read("baseUrl"), allowedHosts: split(read("allowedHosts")), adapter: format === "STANDARD_JSON" ? "JSON_CATALOG" : format, recipe,
        mainCategory: read("mainCategory"), defaultTags: split(read("defaultTags")),
        scanIntervalMinutes: Number(read("scanIntervalMinutes")), requestIntervalMs: Number(read("requestIntervalMs")),
        maxPagesPerRun: Number(read("maxPagesPerRun")), maxItemsTotal: Number(read("maxItemsTotal")), maxFileBytes: Math.round(Number(read("maxFileMB")) * 1024 ** 2),
      };
      if (testing) {
        setResult(await api<TestResult>(`/api/video-sources/${initial?.id ?? "draft"}/test`, "POST", data));
        return;
      }
      const saved = await api<Source>(`/api/video-sources${initial ? `/${initial.id}` : ""}`, initial ? "PATCH" : "POST", data);
      if (onSaved) onSaved(saved);
      else router.push(`/admin/video-sources/${saved.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy) void submit(event.currentTarget, false);
  }
  return <section className={css.formPanel}>
    <header className={css.formHead}>
      <div><h1 id="source-add-heading">{heading}</h1><p>กำหนดเว็บไซต์และรูปแบบข้อมูลสำหรับงานสแกนและดาวน์โหลด</p></div>
      {onCancel && <button type="button" className={css.close} onClick={onCancel} disabled={busy} aria-label="ปิด">×</button>}
    </header>
    {initial && initial.control !== "STOP" && <div className={s.notice}>กดหยุด Task ก่อนบันทึกการตั้งค่า</div>}
    {error && <div className={`${s.notice} ${s.noticeErr}`} role="alert">{error}</div>}
    <form className={css.form} onSubmit={save} aria-busy={busy}>
      <div className={css.formGrid}>
        <label className={s.field}>ชื่อแหล่งข้อมูล<input name="name" defaultValue={initial?.name} required maxLength={160} /></label>
        <label className={s.field}>URL หน้ารายการหรือ catalog<input name="baseUrl" type="url" placeholder="https://your-domain.example/catalog" defaultValue={initial?.baseUrl} required /></label>
        <label className={`${s.field} ${css.wide}`}>รูปแบบข้อมูล
          <select value={format} onChange={(e) => { setFormat(e.target.value as SourceMode); setResult(null); }}>
            <option value="AUTO">อัตโนมัติ — ตรวจโครงสร้างมาตรฐาน</option>
            <option value="STANDARD_JSON">JSON catalog มาตรฐาน</option>
            <option value="JSON_CATALOG">JSON ที่กำหนดตำแหน่งข้อมูลเอง</option>
            <option value="HTML_RECIPE">HTML และ iframe แบบกำหนด selector</option>
          </select>
        </label>
        {format === "AUTO" && <p className={`${css.hint} ${css.wide}`}>ค้นหาลิงก์จากรายการบทความหรือวิดีโอและอ่านตัวเล่น HTML โดยอัตโนมัติ หากยืนยันหน้าสุดท้ายไม่ได้ ระบบจะแจ้งให้ตรวจสอบ</p>}
        {format === "STANDARD_JSON" && <p className={`${css.hint} ${css.wide}`}>ใช้ catalog รูปแบบ 7m-storage ที่มี items, next, terminal และรายการที่ระบุ mainContent</p>}
        {configurable && <label className={`${s.field} ${css.wide}`}>Recipe (JSON)<textarea value={recipes[configurable]} onChange={(e) => setRecipes({ ...recipes, [configurable]: e.target.value })} rows={6} required spellCheck={false} /></label>}
        <label className={s.field}>รอบสแกนใหม่ (นาที, 0 = รอบเดียว)<input type="number" name="scanIntervalMinutes" defaultValue={initial?.scanIntervalMinutes ?? 0} min={0} max={43200} required /></label>
        <label className={s.field}>หมวดหมู่หลัก<input name="mainCategory" defaultValue={initial?.mainCategory} required maxLength={120} /></label>
      </div>
      <details className={css.advanced}>
        <summary>การตั้งค่าเพิ่มเติม</summary>
        <div className={css.formGrid}>
          <label className={`${s.field} ${css.wide}`}>โดเมนไฟล์หรือ iframe เพิ่มเติม<input name="allowedHosts" placeholder="media.your-domain.example" defaultValue={initial?.allowedHosts.filter((host) => host !== new URL(initial.baseUrl).hostname).join(", ")} /><small>ระบบใช้โดเมนจาก URL หน้าแรกให้แล้ว คั่นชื่อโดเมนเพิ่มเติมด้วยจุลภาค</small></label>
          <label className={s.field}>แท็กเริ่มต้น<input name="defaultTags" defaultValue={initial?.defaultTags.join(", ")} placeholder="คั่นด้วยจุลภาค" /></label>
          <label className={s.field}>ระยะห่างคำขอ (มิลลิวินาที)<input type="number" name="requestIntervalMs" defaultValue={initial?.requestIntervalMs ?? 1000} min={1000} max={60000} required /></label>
          <label className={s.field}>หน้าสูงสุดต่อรอบ<input type="number" name="maxPagesPerRun" defaultValue={initial?.maxPagesPerRun ?? 10} min={1} max={100} required /></label>
          <label className={s.field}>รายการสูงสุดต่อ Task<input type="number" name="maxItemsTotal" defaultValue={initial?.maxItemsTotal ?? 1000} min={1} max={100000} required /></label>
          <label className={s.field}>ขนาดไฟล์สูงสุด (MiB)<input type="number" name="maxFileMB" defaultValue={initial ? initial.maxFileBytes / 1024 ** 2 : 4096} min={1024 / 1024 ** 2} step="any" max={20480} required /></label>
        </div>
      </details>
      {result && <div className={s.notice} role="status"><strong>พบ {number(result.discovered)} รายการ{result.terminal ? " · ยืนยันหน้าสุดท้ายแล้ว" : ""}</strong>
        {result.first && <p className={css.breakText}>{result.first.title} · {result.first.mediaUrl}</p>}
        {result.error && <p className={s.err}>{result.error}</p>}
        {result.links.length > 0 && <ul className={css.previewLinks}>{result.links.map((link, index) => <li key={`${link}-${index}`}>{link}</li>)}</ul>}
      </div>}
      <footer className={css.formActions}>
        <button type="button" className="ui-button" disabled={busy} onClick={(e) => { const form = e.currentTarget.form; if (form?.reportValidity()) void submit(form, true); }}>ทดสอบต้นทาง</button>
        {onCancel ? <button type="button" className="ui-button" disabled={busy} onClick={onCancel}>ยกเลิก</button> : <Link className="ui-button" href={returnUrl}>ยกเลิก</Link>}
        <button className={css.submit} disabled={busy || (!!initial && initial.control !== "STOP")}>{busy ? "กำลังทำงาน…" : initial ? "บันทึกการตั้งค่า" : "เพิ่มแหล่งข้อมูล"}</button>
      </footer>
    </form>
  </section>;
}
async function api<T>(url: string, method = "GET", data?: unknown): Promise<T> {
  const res = await fetch(url, { method, cache: "no-store", ...(data === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(data) }) });
  const body = await res.json();
  if (!res.ok) throw new Error(body.issues?.map((i: { message: string }) => i.message).join(" · ") || body.error || "ทำรายการไม่สำเร็จ");
  return body;
}
function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (n: number) => void }) {
  return <div className={css.pagination}><button className="ui-button" disabled={page <= 1} onClick={() => onChange(page - 1)}>ก่อนหน้า</button><span>หน้า {page} · {total} รายการ</span><button className="ui-button" disabled={page * 50 >= total} onClick={() => onChange(page + 1)}>ถัดไป</button></div>;
}
function status(source: Source, workerOnline = true) {
  if (workerOnline && source.control !== "STOP" && source.counts?.DOWNLOADING) return "กำลังดาวน์โหลด";
  if (workerOnline && source.control !== "STOP" && (source.scanning || source.counts?.RESOLVING)) return "กำลังสแกน";
  if (source.pageStats?.failed) return "สแกนยังไม่ครบ";
  if (source.scanComplete && !source.counts?.PENDING) return "สแกนครบ";
  if (source.control === "RUN" && !workerOnline) return "รอ Worker";
  if (!source.lastScanAt) return "ยังไม่เริ่ม";
  if (source.control === "RUN") return "อยู่ในคิว";
  return labels[source.control];
}
function WorkerDisk({ worker }: { worker: Worker | null }) {
  const free = worker?.freeBytes;
  const total = worker?.totalBytes;
  const used = free != null && total != null ? Math.max(0, total - free) : null;
  const percent = used != null && total ? Math.round(100 * used / total) : 0;
  const gib = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
  return <section className={css.panel}>
    <div className={css.panelHead}><div><h2>พื้นที่จัดเก็บของ Worker</h2><p>{worker ? `ตรวจล่าสุด ${date(worker.sampledAt)}` : "รอข้อมูลจาก Worker"}</p></div></div>
    <div className={css.diskBody}>
      {used != null && free != null && total != null ? <>
        <div className={css.diskLabel}><span><strong>{gib(free)}</strong> ว่างให้ Worker ใช้</span><small>ใช้แล้ว {gib(used)} จาก {gib(total)}</small></div>
        <progress className={percent >= 90 ? css.diskWarning : ""} max={100} value={percent} aria-label="พื้นที่ดิสก์ที่ใช้แล้ว" />
        <p>พื้นที่ชั่วคราวสำหรับดาวน์โหลด ตรวจไฟล์ และรวม HLS ก่อนอัปโหลดเข้า R2</p>
      </> : <p>ยังไม่มีข้อมูลพื้นที่ดิสก์</p>}
    </div>
  </section>;
}

export function VideoSourcesManager({ id, mode = "list", canManage }: { id?: string; mode?: "list" | "detail" | "form"; canManage: boolean }) {
  const router = useRouter();
  const [listData, setListData] = useState<ListData | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [updated, setUpdated] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const modal = useRef<HTMLDialogElement>(null);
  const refreshId = useRef(0);
  const [detail, setDetail] = useState<Detail | null>(null); const [items, setItems] = useState<Item[]>([]);
  const [itemTotal, setItemTotal] = useState(0); const [page, setPage] = useState(1); const [pagePage, setPagePage] = useState(1);
  const [filter, setFilter] = useState(""); const [tab, setTab] = useState("items");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [loaded, setLoaded] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [runMessage, setRunMessage] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (addOpen && !modal.current?.open) modal.current?.showModal();
    if (!addOpen && modal.current?.open) modal.current.close();
  }, [addOpen]);
  const refresh = useCallback(async () => {
    const requestId = ++refreshId.current;
    try {
      if (mode === "list") {
        const params = new URLSearchParams({ page: String(page), q: query, filter: taskFilter });
        const body = await api<ListData>(`/api/video-sources?${params}`);
        if (requestId !== refreshId.current) return;
        if (page > 1 && !body.sources.length) { setPage(Math.max(1, Math.ceil(body.total / 50))); return; }
        setListData(body); setUpdated(new Date().toISOString());
      } else if (id) {
        const body = await api<Detail>(`/api/video-sources/${id}?page=${pagePage}`); setDetail(body);
        if (mode === "detail") {
          const list = await api<{ items: Item[]; total: number }>(`/api/video-sources/${id}/items?page=${page}&state=${filter}`); setItems(list.items); setItemTotal(list.total);
        }
      }
      setError(""); setLoaded(true);
    } catch (cause) { if (requestId === refreshId.current) setError(cause instanceof Error ? cause.message : "โหลดข้อมูลไม่สำเร็จ"); }
  }, [mode, id, page, filter, pagePage, query, taskFilter]);
  useEffect(() => { void refresh(); }, [refresh]);
  const active = mode === "list" || (detail && (detail.source.control === "RUN" || detail.counts.DOWNLOADING || detail.counts.RESOLVING || detail.pages.some((p) => p.state === "RUNNING")));
  useEffect(() => { if (!active || mode === "form") return; const timer = setInterval(() => void refresh(), 5000); return () => clearInterval(timer); }, [active, mode, refresh]);
  async function action(url: string, method: string, data?: unknown) {
    setBusy(true); setError("");
    try { await api(url, method, data); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : "ทำรายการไม่สำเร็จ"); } finally { setBusy(false); }
  }
  async function processSource(source: Source) {
    setProcessing(true); setRunMessage("");
    try {
      const result = await api<{ results: { error?: string; item?: { status: string; error?: string } | null }[] }>(`/api/video-sources/${source.id}/process`, "POST");
      const entry = result.results[0];
      setRunMessage(entry?.error || entry?.item?.error || (entry?.item?.status === "DONE" ? "ดาวน์โหลดสำเร็จและส่งวิดีโอเข้ารอตรวจสอบแล้ว" : entry ? "สแกนจบรอบแล้ว ดูผลที่รายการและหน้าที่สแกน" : "ไม่มีงานที่พร้อมทำสำหรับ Task นี้"));
      await refresh();
    } catch (cause) { setRunMessage(cause instanceof Error ? cause.message : "ประมวลผลไม่สำเร็จ"); }
    finally { setProcessing(false); }
  }
  function controls(source: Source) {
    const commands = [["RUN", "▷", "เริ่ม"], ["PAUSE", "Ⅱ", "พัก"], ["STOP", "□", "หยุด"]] as const;
    return canManage && <div className={css.controls}>{commands.map(([value, icon, label]) => <button type="button" key={value} className={css.command} data-command={value} disabled={busy || source.control === value} onClick={() => action(`/api/video-sources/${source.id}/control`, "POST", { action: value })}><span aria-hidden="true">{icon}</span> {label}</button>)}</div>;
  }
  if (mode === "form") return <>{error && <p className={`${s.notice} ${s.noticeErr}`} role="alert">{error}</p>}{(!id || detail) ? <SourceForm initial={detail?.source} /> : <p>กำลังโหลดแหล่ง…</p>}</>;
  const workerOnline = !!listData?.worker && Date.now() - Date.parse(listData.worker.sampledAt) < 6 * 60_000;
  const summary = listData?.summary;
  const tiles = [
    ["Tasks ทั้งหมด", summary?.tasks, "neutral", "▤"], ["เปิดทำงาน", summary?.running, "blue", "↗"],
    ["วิดีโอที่พบ", summary?.discovered, "violet", "▷"], ["วิดีโอรอตรวจ", summary?.ready, "amber", "◷"],
    ["ข้อผิดพลาด หน้า / วิดีโอ", summary?.errors, "red", "!"],
  ] as const;
  const filters = [["all", "ทั้งหมด", summary?.tasks], ["running", "เปิดทำงาน", summary?.running], ["attention", "ต้องตรวจสอบ", summary?.attention], ["idle", "พัก / หยุด", summary && summary.tasks - summary.running]] as const;
  return <div className={css.root}>
    <header className={css.workspaceHead}>
      <div className={css.heading}><span className={css.headingIcon} aria-hidden="true">↧</span><div>
        <h1>{mode === "detail" ? detail?.source.name || "รายละเอียดแหล่ง" : "งานดาวน์โหลด"}</h1>
        <p>{mode === "detail" ? "ติดตามการสแกน ดาวน์โหลด และตรวจสอบวิดีโอของแหล่งนี้" : "จัดการแหล่งวิดีโอ (1 เว็บไซต์ต่อ 1 Task) และติดตามการสแกนและดาวน์โหลด"}</p>
        {mode === "list" && <div className={css.live}>
          <span className={css.pill} data-tone={workerOnline ? "green" : "amber"}>{workerOnline ? "Worker ออนไลน์" : listData?.worker ? "Worker ไม่ตอบล่าสุด" : "รอข้อมูล Worker"}</span>
          <span className={css.pill} data-tone={loaded && !error ? "green" : "neutral"}>{loaded && !error ? "ข้อมูลสด" : error ? "อัปเดตไม่สำเร็จ" : "กำลังโหลด"}</span>
          {updated && <span>อัปเดต {new Date(updated).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok" })} · รีเฟรชทุก 5 วินาที</span>}
        </div>}
      </div></div>
      <div className={s.headActions}><Link className="ui-button" href="/admin/review?source=scan">ศูนย์ตรวจสอบวิดีโอ</Link>{mode === "detail" ? <Link className="ui-button" href="/admin/video-sources">ทุกแหล่ง</Link> : canManage && <button type="button" className={css.primary} onClick={() => setAddOpen(true)}>＋ เพิ่ม Task เว็บไซต์</button>}</div>
    </header>
    {error && <div className={`${s.notice} ${s.noticeErr}`} role="alert">{error}<button className="ui-button" onClick={() => void refresh()}>โหลดใหม่</button></div>}
    {runMessage && <div className={s.notice} role="status">{runMessage}</div>}
    {!loaded && !error && <p>กำลังโหลด…</p>}
    {mode === "list" && <>
      <div className={css.tiles}>{tiles.map(([label, value, tone, icon]) => <div className={css.tile} key={label} data-tone={tone}><span>{label}</span><span className={css.tileIcon} aria-hidden="true">{icon}</span><strong>{value == null ? "—" : number(value)}</strong></div>)}</div>
      <WorkerDisk worker={listData?.worker ?? null} />
      <section className={css.panel}>
        <div className={css.panelHead}><div><h2>รายการ Tasks <span className={css.count}>{number(summary?.tasks ?? 0)}</span></h2><p>คลิกชื่อเพื่อดูรายละเอียด วิดีโอ การตั้งค่าและ Logs</p></div>
          <input className={css.search} type="search" value={search} maxLength={160} aria-label="ค้นหา Task" placeholder="ค้นหาชื่องานหรือเว็บไซต์…" onChange={(e) => setSearch(e.target.value)} /></div>
        <div className={css.filters}><nav aria-label="กรอง Task">{filters.map(([key, label, count]) => <button type="button" key={key} aria-pressed={taskFilter === key} onClick={() => { setTaskFilter(key); setPage(1); }}>{label} <span>{number(count ?? 0)}</span></button>)}</nav></div>
        <ul className={css.taskList}>{listData?.sources.map((source) => {
          const taskStatus = status(source, workerOnline);
          const pages = source.pageStats ?? { total: 0, done: 0, failed: 0 };
          const found = Object.values(source.counts).reduce((a, b) => a + b, 0);
          const failed = (source.counts.FAILED ?? 0) + (source.counts.UNSUPPORTED ?? 0);
          const tone = taskStatus === "สแกนครบ" ? "green" : source.scanning || source.counts.DOWNLOADING ? "blue" : pages.failed || source.control !== "RUN" ? "amber" : "neutral";
          const href = `/admin/video-sources/${source.id}`;
          return <li key={source.id} className={css.task}>
            <div className={css.taskIdentity}><span className={css.globe} aria-hidden="true">◎</span><div>
              <Link className={css.taskName} href={href}>{source.name}</Link>
              <p>{new URL(source.baseUrl).hostname} · อัปเดต {date(source.updatedAt)}</p>
              {source.lastError && <small className={css.taskError}>{source.lastError}</small>}
            </div></div>
            <div className={css.taskStatus}><span className={css.pill} data-tone={tone}>{taskStatus}</span><p>คำสั่ง {source.control === "RUN" ? "เปิดทำงาน" : source.control === "PAUSE" ? "พักไว้" : "หยุดแล้ว"}</p></div>
            <div className={css.taskProgress}><p>สแกน {number(pages.done)}/{number(pages.total)} หน้า {pages.failed > 0 && <span className={css.taskError}> · ผิดพลาด {number(pages.failed)}</span>}</p>
              <progress value={pages.done} max={pages.total || 1} aria-label={`ความคืบหน้า ${source.name}`} />
              <p>พบ <strong>{number(found)}</strong><span className={css.taskReview}>รอตรวจ <strong>{number(source.ready ?? 0)}</strong></span>{failed > 0 && <span className={css.taskError}>วิดีโอผิดพลาด <strong>{number(failed)}</strong></span>}</p></div>
            <div className={css.taskActions}>{controls(source)}<Link href={href} className={css.detailLink} aria-label={`ดูรายละเอียด ${source.name}`}>›</Link></div>
          </li>;
        })}</ul>
        {loaded && !listData?.sources.length && <div className={s.empty}>{query || taskFilter !== "all" ? "ไม่พบ Task ที่ตรงกับตัวกรอง" : "ยังไม่มี Task เว็บไซต์"}</div>}
        {!!listData?.total && <Pagination page={page} total={listData.total} onChange={setPage} />}
      </section>
      {canManage && <dialog ref={modal} className={css.dialog} onClose={() => setAddOpen(false)} onCancel={(e) => { if (e.currentTarget.querySelector('form[aria-busy="true"]')) e.preventDefault(); }} aria-labelledby="source-add-heading">
        {addOpen && <SourceForm onCancel={() => setAddOpen(false)} onSaved={(saved) => { setAddOpen(false); router.push(`/admin/video-sources/${saved.id}`); }} />}
      </dialog>}
    </>}
    {mode === "detail" && detail && <>
      {canManage && detail.source.control === "RUN" && <div className={s.headActions}><button type="button" className={css.primary} disabled={processing || busy} onClick={() => void processSource(detail.source)}>{processing ? "กำลังประมวลผล…" : "สแกนและดาวน์โหลดตอนนี้"}</button></div>}
      <section className={s.card}><div className={s.cardBody}><div className={s.head}><div><strong>{status({ ...detail.source, counts: detail.counts })}</strong><p>Recipe v{detail.source.recipeVersion}</p></div>{controls(detail.source)}</div>{canManage && <div className={s.headActions}><Link className="ui-button" href={`/admin/video-sources/${id}/edit`}>แก้ไขแหล่ง / recipe</Link><button className="ui-button" disabled={busy} onClick={async () => { if (!window.confirm("หยุดงานและลบแหล่งนี้ออกจากรายการ? วิดีโอที่สร้างแล้วจะยังอยู่")) return; setBusy(true); try { await api(`/api/video-sources/${id}`, "DELETE"); router.push("/admin/video-sources"); } catch (cause) { setError(cause instanceof Error ? cause.message : "ลบไม่สำเร็จ"); } finally { setBusy(false); } }}>ลบแหล่ง</button></div>}</div></section>
      <div className={s.stats}>{["PENDING", "RESOLVING", "DOWNLOADING", "DONE", "FAILED", "UNSUPPORTED"].map((key) => <div className={s.stat} key={key}><small>{labels[key]}</small><strong>{detail.counts[key] || 0}</strong></div>)}</div>
      <section className={s.card}><div className={s.cardHead}><nav className={s.tabs}>{[["items", "รายการ"], ["pages", "หน้าที่สแกน"], ["events", "Log เหตุการณ์"]].map(([key, label]) => <button className={`${s.tab} ${tab === key ? s.tabActive : ""}`} key={key} onClick={() => setTab(key!)}>{label}</button>)}</nav><small className={s.meta}>{active ? "อัปเดตทุก 5 วินาที" : "พักการอัปเดตอัตโนมัติ"}</small></div>
      {tab === "items" && <><div className={s.cardBody}><label className={s.field}>สถานะ<select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}><option value="">ทั้งหมด</option>{["PENDING", "RESOLVING", "DOWNLOADING", "DONE", "FAILED", "UNSUPPORTED"].map((key) => <option value={key} key={key}>{labels[key]}</option>)}</select></label></div><div className={s.tableWrap}><table className={s.table}><thead><tr><th>วิดีโอ</th><th>สถานะ</th><th>ดาวน์โหลดแล้ว</th><th>ครั้งที่ลอง</th><th>การดำเนินการ</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><div className={s.title}>{item.title || "รออ่านชื่อวิดีโอ"}</div><div className={s.url}>{item.pageUrl}</div>{item.error && <div className={s.err}>{item.error}</div>}</td><td>{labels[item.state]}</td><td>{size(item.bytes)}</td><td>{item.attempts} / 3</td><td>{item.movieId ? <Link className="ui-button" href={`/admin/videos/${item.movieId}`}>ตรวจสอบวิดีโอ</Link> : canManage && ["FAILED", "UNSUPPORTED"].includes(item.state) && <button className="ui-button" disabled={busy} onClick={() => action(`/api/video-sources/${id}/items/${item.id}/retry`, "POST")}>ลองใหม่</button>}</td></tr>)}</tbody></table></div><Pagination page={page} total={itemTotal} onChange={setPage} /></>}
      {tab === "pages" && <><div className={s.tableWrap}><table className={s.table}><thead><tr><th>หน้า</th><th>สถานะ</th><th>สิ้นสุดรายการ</th><th>ครั้งที่ลอง</th></tr></thead><tbody>{detail.pages.map((p) => <tr key={p.id}><td><span className={s.url}>{p.url}</span>{p.error && <div className={s.err}>{p.error}</div>}</td><td>{labels[p.state]}</td><td>{p.terminal ? "ยืนยันแล้ว" : "ยังไม่ยืนยัน"}</td><td>{p.attempts} / 3</td></tr>)}</tbody></table></div><Pagination page={pagePage} total={detail.pageTotal} onChange={setPagePage} /></>}
      {tab === "events" && <div className={s.cardBody}><p className={s.meta}>เก็บล่าสุด 1,000 เหตุการณ์</p>{detail.events.map((event) => <p className={css.event} key={event.id}><time>{date(event.at)}</time><span>{event.message}</span><code>{event.code}</code></p>)}</div>}
      </section>
    </>}
  </div>;
}
