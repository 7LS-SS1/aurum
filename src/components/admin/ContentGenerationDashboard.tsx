"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api-client";

type MovieRow = {
  id: string;
  title: string;
  mainCategory: string | null;
  thumbnailUrl: string | null;
  status: string;
  updatedAt: string;
};

type SiteRow = { id: string; name: string; baseUrl: string; healthStatus: string };
type JobRow = {
  id: string;
  provider: string;
  model: string;
  status: string;
  totalItems: number;
  processedItems: number;
  readyItems: number;
  approvedItems: number;
  rejectedItems: number;
  failedItems: number;
  createdAt: string;
  requestedBy: { name: string | null; email: string } | null;
};

const JOB_STATUS: Record<string, { label: string; tone: string }> = {
  QUEUED: { label: "รอเริ่ม", tone: "neutral" },
  PROCESSING: { label: "กำลังสร้าง", tone: "gold" },
  COMPLETED: { label: "พร้อมตรวจ", tone: "ok" },
  PARTIAL_FAILED: { label: "สำเร็จบางส่วน", tone: "warn" },
  FAILED: { label: "ล้มเหลว", tone: "bad" },
  CANCELLED: { label: "ยกเลิก", tone: "neutral" },
};

function toggle(setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
  setter(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}

function batchIdempotencyKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `admin-${uuid ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function batchErrorMessage(error: unknown): string {
  if (!(error instanceof ApiClientError)) return error instanceof Error ? error.message : "สร้าง Batch ไม่สำเร็จ";
  const messages: Record<string, string> = {
    unauthorized: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง",
    content_ai_disabled: "ยังไม่ได้เปิดใช้งาน AI Provider ที่เลือก",
    internal_server_error: "เซิร์ฟเวอร์สร้าง Batch ไม่สำเร็จ กรุณาลองอีกครั้ง",
  };
  return messages[error.code ?? error.message] ?? error.message;
}

export function ContentGenerationDashboard({
  initialMovies,
  initialSites,
  initialJobs,
}: {
  initialMovies: MovieRow[];
  initialSites: SiteRow[];
  initialJobs: JobRow[];
}) {
  const router = useRouter();
  const [movieIds, setMovieIds] = useState<Set<string>>(new Set());
  const [siteIds, setSiteIds] = useState<Set<string>>(new Set());
  const [provider, setProvider] = useState<"grok" | "openai">("grok");
  const [trends, setTrends] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const filteredMovies = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("th");
    return needle ? initialMovies.filter(movie => `${movie.title} ${movie.mainCategory ?? ""}`.toLocaleLowerCase("th").includes(needle)) : initialMovies;
  }, [initialMovies, query]);
  const combinations = movieIds.size * siteIds.size;

  function createBatch() {
    if (!movieIds.size || !siteIds.size) {
      setMessage("เลือกวิดีโอและเว็บไซต์อย่างน้อยอย่างละ 1 รายการ");
      return;
    }
    startTransition(async () => {
      setMessage("");
      try {
        const result = await apiFetch<{ job: { id: string }; reused: boolean }>("/api/content-generation/jobs", {
          method: "POST",
          headers: { "Idempotency-Key": batchIdempotencyKey() },
          body: JSON.stringify({
            movieIds: [...movieIds],
            siteIds: [...siteIds],
            provider,
            trendKeywords: trends.split(/[\n,]/).map(value => value.trim()).filter(Boolean),
          }),
        });
        router.push(`/admin/content-generation/${result.job.id}`);
      } catch (error) {
        setMessage(batchErrorMessage(error));
      }
    });
  }

  return (
    <div className="cg-dashboard">
      <div className="cg-product-note">
        <strong>Human approval required</strong>
        <span>AI จะสร้าง draft เท่านั้น ไม่มีการส่งหรือเขียนทับ WordPress จากหน้านี้</span>
      </div>

      <div className="cg-create-grid">
        <div className="panel cg-selection-panel">
          <div className="panel-head"><span className="n">1</span><h3>เลือกวิดีโอ</h3><span className="sub">เลือกแล้ว {movieIds.size}</span></div>
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหาชื่อหรือหมวดหมู่" />
          <div className="cg-select-actions">
            <button type="button" className="btn-ghost" onClick={() => setMovieIds(new Set(filteredMovies.map(movie => movie.id)))}>เลือกที่ค้นพบทั้งหมด</button>
            <button type="button" className="btn-ghost" onClick={() => setMovieIds(new Set())}>ล้าง</button>
          </div>
          <div className="cg-option-list">
            {filteredMovies.map(movie => (
              <label className={`cg-option ${movieIds.has(movie.id) ? "selected" : ""}`} key={movie.id}>
                <input type="checkbox" checked={movieIds.has(movie.id)} onChange={() => toggle(setMovieIds, movie.id)} />
                {movie.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin thumbnails may come from arbitrary configured media hosts
                  <img src={movie.thumbnailUrl} alt="" />
                ) : <span className="cg-option-placeholder">▶</span>}
                <span><strong>{movie.title}</strong><small>{movie.mainCategory ?? "ไม่มีหมวดหมู่"} · {movie.status}</small></span>
              </label>
            ))}
            {!filteredMovies.length && <p className="hint">ไม่พบวิดีโอ</p>}
          </div>
        </div>

        <div>
          <div className="panel cg-selection-panel">
            <div className="panel-head"><span className="n">2</span><h3>เลือกเว็บไซต์</h3><span className="sub">เลือกแล้ว {siteIds.size}</span></div>
            <div className="cg-option-list cg-site-list">
              {initialSites.map(site => (
                <label className={`cg-option ${siteIds.has(site.id) ? "selected" : ""}`} key={site.id}>
                  <input type="checkbox" checked={siteIds.has(site.id)} onChange={() => toggle(setSiteIds, site.id)} />
                  <span className={`cg-health ${site.healthStatus.toLowerCase()}`} />
                  <span><strong>{site.name}</strong><small>{site.baseUrl}</small></span>
                </label>
              ))}
              {!initialSites.length && <p className="hint">ยังไม่มีเว็บไซต์ที่เปิดใช้งาน</p>}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><span className="n">3</span><h3>ตั้งค่าการสร้าง</h3></div>
            <div className="row2">
              <div className="field"><label>AI Provider</label><select value={provider} onChange={event => setProvider(event.target.value as "grok" | "openai")}><option value="grok">Grok (xAI)</option><option value="openai">OpenAI</option></select></div>
              <div className="field"><label>จำนวนงาน</label><input value={`${combinations.toLocaleString("th-TH")} รายการ`} readOnly /></div>
            </div>
            <div className="field"><label>Trend Keywords (กรอกเอง)</label><textarea value={trends} onChange={event => setTrends(event.target.value)} placeholder="คั่นด้วย comma หรือขึ้นบรรทัดใหม่" rows={4} /></div>
            {message && <p className="cg-error" role="alert">{message}</p>}
            <button className="btn btn-gold" type="button" disabled={pending || combinations === 0 || combinations > 500} onClick={createBatch}>
              {pending ? "กำลังสร้าง Batch…" : `สร้าง Batch ${combinations.toLocaleString("th-TH")} รายการ`}
            </button>
            {combinations > 500 && <p className="cg-error">หนึ่ง Batch รองรับสูงสุด 500 รายการ</p>}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><span className="n">4</span><h3>Batch ล่าสุด</h3><span className="sub">{initialJobs.length} รายการ</span></div>
        <div className="cg-job-list">
          {initialJobs.map(job => {
            const meta = JOB_STATUS[job.status] ?? { label: job.status, tone: "neutral" };
            const progress = job.totalItems ? Math.round((job.processedItems / job.totalItems) * 100) : 0;
            return (
              <Link href={`/admin/content-generation/${job.id}`} className="cg-job-row" key={job.id}>
                <div><strong>{job.provider.toUpperCase()}</strong><small>{job.model} · {new Date(job.createdAt).toLocaleString("th-TH")}</small></div>
                <div className="cg-job-progress"><span style={{ width: `${progress}%` }} /></div>
                <div className="cg-job-counts"><span>{job.processedItems}/{job.totalItems}</span><span>รอตรวจ {job.readyItems}</span><span>อนุมัติ {job.approvedItems}</span>{job.failedItems > 0 && <span className="bad">ล้มเหลว {job.failedItems}</span>}</div>
                <span className={`badge ${meta.tone}`}>{meta.label}</span>
              </Link>
            );
          })}
          {!initialJobs.length && <p className="hint">ยังไม่มี Batch</p>}
        </div>
      </div>
    </div>
  );
}
