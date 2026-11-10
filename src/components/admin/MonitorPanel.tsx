"use client";
import Link from "next/link";
import { useEffect, useState, useId } from "react";
import { apiFetch } from "@/lib/api-client";
import {
  values,
  type MonitorSnapshot,
  type MonitorRow,
  type Metric,
} from "@/lib/monitor/types";
import styles from "./MonitorPanel.module.css";
import { bandwidthScale } from "@/lib/monitor/bandwidth";
const names = {
  cpu: "CPU",
  memory: "Memory",
  disk: "Storage",
  bandwidth: "Bandwidth",
  offline: "ขาดการเชื่อมต่อ",
};
const scopes = {
  host: "ทั้งโฮสต์",
  container: "Container",
  site: "เฉพาะเว็บไซต์",
  "hosting-account": "ทั้งแพ็กเกจโฮสติ้ง",
};
const time = (s: string) => new Date(s).toLocaleTimeString("th-TH");
const bytes = (n: number | null | undefined) =>
  n == null
    ? "—"
    : n >= 1073741824
      ? `${(n / 1073741824).toFixed(1)} GB`
      : n >= 1048576
        ? `${(n / 1048576).toFixed(1)} MB`
        : `${(n / 1024).toFixed(1)} KB`;
const mbps = (n: number | null | undefined) =>
  n == null ? "—" : `${((n * 8) / 1e6).toFixed(2)} Mbps`;
function useMonitor(summary = false) {
  const [data, setData] = useState<MonitorSnapshot | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      if (!document.hidden) {
        try {
          const next = await apiFetch<MonitorSnapshot>(
            `/api/monitor${summary ? "?summary=1" : ""}`,
            {
              cache: "no-store",
              signal: AbortSignal.any([
                controller.signal,
                AbortSignal.timeout(15000),
              ]),
            },
          );
          if (!stopped) {
            setData(next);
            setError("");
          }
        } catch {
          if (!stopped)
            setError(
              "อ่าน Monitor ไม่สำเร็จ ข้อมูลเดิมอาจล้าสมัย · ระบบจะลองใหม่อัตโนมัติ",
            );
        }
      }
      if (!stopped) timer = setTimeout(poll, summary ? 30000 : 10000);
    }
    void poll();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [summary]);
  return { data, error };
}
export function MonitorNav() {
  const { data, error } = useMonitor(true);
  const n =
    data?.rows.reduce(
      (sum, row) =>
        sum + row.alerts.filter((a) => a.status === "active").length,
      0,
    ) ?? 0;
  return (
    <Link href="/admin/monitor" className="side-link">
      Monitor Panel{" "}
      <span
        aria-live="polite"
        style={{ color: error || n ? "#ffb479" : "#91d9b3", marginLeft: 8 }}
      >
        {error ? "!" : n ? `${n} Alert` : ""}
      </span>
    </Link>
  );
}
function Chart({ row, metric }: { row: MonitorRow; metric: Metric }) {
  const scale = bandwidthScale(row.history, row.source.capacityMbps);
  const history = row.history,
    start = history[0] ? Date.parse(history[0].timestamp) : 0,
    end = history.at(-1) ? Date.parse(history.at(-1)!.timestamp) : start;
  const points = history.map((s) => ({
    time: Date.parse(s.timestamp),
    x:
      end > start
        ? ((Date.parse(s.timestamp) - start) / (end - start)) * 600
        : 0,
    y: values(s, scale.mbps)[metric],
  }));
  let d = "",
    continuing = false,
    previous = 0;
  for (const p of points) {
    if (p.time - previous > row.source.intervalSeconds * 3000)
      continuing = false;
    previous = p.time;
    if (p.y === null) {
      continuing = false;
      continue;
    }
    d += `${continuing ? "L" : "M"}${p.x},${100 - Math.min(p.y, 100)} `;
    continuing = true;
  }
  return (
    <div className={styles.percentChart}>
      <svg
        viewBox="0 0 600 110"
        preserveAspectRatio="none"
        role="img"
        aria-label={`กราฟ ${names[metric]} 0–100 เปอร์เซ็นต์ ตัวอย่างล่าสุด ${history.length} จุด`}
      >
        <path
          d="M0 0H600 M0 50H600 M0 100H600"
          stroke="#ffffff12"
          fill="none"
        />
        {!(metric === "bandwidth" && scale.estimated) && <path
          d={`M0 ${100 - row.source.thresholds[metric]}H600`}
          stroke="#e9a055"
          strokeDasharray="5 5"
          fill="none"
        />}
        <path
          d={d}
          stroke="#edd181"
          strokeWidth="2"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div>
        <span>
          {history[0] ? time(history[0].timestamp) : "ยังไม่มีข้อมูล"}
        </span>
        <span>{metric === "bandwidth" && scale.estimated ? `เพดานประเมิน ${scale.mbps ?? "—"} Mbps · ไม่ใช่ขีดจำกัดลิงก์จริง` : "0–100% · เส้นประ = เกณฑ์เตือน"}</span>
        <span>{history.at(-1) ? time(history.at(-1)!.timestamp) : "—"}</span>
      </div>
    </div>
  );
}

function Gauges({ row }: { row?: MonitorRow }) {
  const scale = bandwidthScale(row?.history ?? [], row?.source.capacityMbps);
  const last = row?.history.at(-1),
    v = last ? values(last, scale.mbps) : null;
  const detail: Record<Metric, string> = {
    cpu: "การใช้งานหน่วยประมวลผล",
    memory: last
      ? `${bytes(last.memoryUsed)} / ${bytes(last.memoryTotal)}`
      : "รอข้อมูลหน่วยความจำ",
    disk: last
      ? `${bytes(last.diskUsed)} / ${bytes(last.diskTotal)}`
      : "รอข้อมูลพื้นที่จัดเก็บ",
    bandwidth: scale.mbps
      ? `${scale.estimated ? "เพดานประเมินอัตโนมัติ" : "ความจุ"} ${scale.mbps.toLocaleString("th-TH")} Mbps`
      : "รอ Traffic เพื่อประเมินเพดาน",
  };
  return (
    <div className={styles.gauges}>
      {(["cpu", "memory", "disk", "bandwidth"] as Metric[]).map((metric) => {
        const value = v?.[metric] ?? null;
        return (
          <article className={styles.gaugeCard} key={metric}>
            <div
              className={styles.ring}
              data-warning={
                !(metric === "bandwidth" && scale.estimated) &&
                value !== null &&
                !!row &&
                value >= row.source.thresholds[metric]
              }
            >
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle cx="50" cy="50" r="42" />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  pathLength="100"
                  strokeDasharray={`${value === null ? 0 : Math.min(100, value)} 100`}
                  transform="rotate(-90 50 50)"
                />
              </svg>
              <strong>{value === null ? "—" : `${value.toFixed(0)}%`}</strong>
            </div>
            <div>
              <h2>{names[metric]}</h2>
              <p>{detail[metric]}</p>
              {metric === "bandwidth" && scale.estimated && <small>อิงค่าสูงสุดในช่วงกราฟ + 25% · ไม่ใช่ขีดจำกัดจริง</small>}
            </div>
          </article>
        );
      })}
    </div>
  );
}
function Traffic({ row }: { row?: MonitorRow }) {
  const [metric, setMetric] = useState<Metric | "traffic">("traffic");
  const gradient = useId().replace(/:/g, ""),
    history = row?.history ?? [],
    last = history.at(-1),
    start = history[0] ? Date.parse(history[0].timestamp) : 0,
    end = last ? Date.parse(last.timestamp) : 0;
  const max =
    Math.max(
      1,
      ...history
        .flatMap((s) => [s.rxBytesPerSecond ?? 0, s.txBytesPerSecond ?? 0])
        .map((n) => (n * 8) / 1e6),
    ) * 1.1;
  function paths(field: "rxBytesPerSecond" | "txBytesPerSecond") {
    const segments: { x: number; y: number }[][] = [];
    let segment: { x: number; y: number }[] = [],
      previous = 0;
    for (const sample of history) {
      const timestamp = Date.parse(sample.timestamp),
        value = sample[field];
      if (
        value === null ||
        timestamp - previous > (row?.source.intervalSeconds ?? 15) * 3000
      ) {
        if (segment.length) segments.push(segment);
        segment = [];
      }
      previous = timestamp;
      if (value !== null)
        segment.push({
          x:
            45 +
            (end > start ? ((timestamp - start) / (end - start)) * 540 : 0),
          y: 200 - ((value * 8) / 1e6 / max) * 180,
        });
    }
    if (segment.length) segments.push(segment);
    return segments.map((points) => ({
      line: points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" "),
      area:
        `M${points[0]!.x},200 ` +
        points.map((p) => `L${p.x},${p.y}`).join(" ") +
        ` L${points.at(-1)!.x},200 Z`,
      points,
    }));
  }
  return (
    <section className={styles.trafficPanel}>
      <header>
        <h2>{metric === "traffic" ? "Traffic" : names[metric]}</h2>
        <select
          aria-label="เลือกกราฟ"
          value={metric}
          onChange={(e) => setMetric(e.target.value as Metric | "traffic")}
        >
          <option value="traffic">Traffic · Mbps</option>
          {(["cpu", "memory", "disk", "bandwidth"] as Metric[]).map((key) => (
            <option key={key} value={key}>
              {names[key]} · %
            </option>
          ))}
        </select>
      </header>
      <div className={styles.networkStats}>
        <div>
          <span>↓ รับเข้า</span>
          <strong>{mbps(last?.rxBytesPerSecond)}</strong>
        </div>
        <div>
          <span>↑ ส่งออก</span>
          <strong>{mbps(last?.txBytesPerSecond)}</strong>
        </div>
        <div>
          <span>รับเข้าสะสม</span>
          <strong>{bytes(last?.rxBytes)}</strong>
        </div>
        <div>
          <span>ส่งออกสะสม</span>
          <strong>{bytes(last?.txBytes)}</strong>
        </div>
      </div>
      <div className={styles.networkChart}>
        {metric !== "traffic" && row ? (
          <Chart row={row} metric={metric} />
        ) : !history.length ? (
          <div className={styles.chartEmpty}>
            <span>⌁</span>
            <strong>รอข้อมูล Traffic</strong>
            <p>กราฟจะแสดงเมื่อเชื่อมต่อแหล่งข้อมูลแล้ว</p>
          </div>
        ) : (
          <>
            <svg
              viewBox="0 0 600 230"
              role="img"
              aria-label="กราฟ Traffic รับเข้าสีทอง ส่งออกสีขาว หน่วย Mbps"
            >
              <defs>
                {["rx", "tx"].map((key, i) => (
                  <linearGradient
                    key={key}
                    id={gradient + key}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={i ? "#d5d2c8" : "#d4af37"}
                      stopOpacity=".28"
                    />
                    <stop
                      offset="100%"
                      stopColor={i ? "#d5d2c8" : "#d4af37"}
                      stopOpacity="0"
                    />
                  </linearGradient>
                ))}
              </defs>
              {[0, 1, 2, 3, 4].map((i) => (
                <g key={i}>
                  <path
                    d={`M45 ${20 + i * 45}H585`}
                    stroke="#ffffff12"
                    strokeDasharray="3 3"
                  />
                  <text
                    x="36"
                    y={24 + i * 45}
                    textAnchor="end"
                    fill="#929292"
                    fontSize="10"
                  >
                    {(max * (1 - i / 4)).toFixed(1)}
                  </text>
                </g>
              ))}
              {(["rxBytesPerSecond", "txBytesPerSecond"] as const).map(
                (field, i) =>
                  paths(field).map((p, j) => (
                    <g key={field + j}>
                      <path
                        d={p.area}
                        fill={`url(#${gradient + (i ? "tx" : "rx")})`}
                      />
                      <path
                        d={p.line}
                        fill="none"
                        stroke={i ? "#d5d2c8" : "#e8c65e"}
                        strokeWidth="2"
                      />
                      {p.points.length === 1 && (
                        <circle
                          cx={p.points[0]!.x}
                          cy={p.points[0]!.y}
                          r="3"
                          fill={i ? "#d5d2c8" : "#e8c65e"}
                        />
                      )}
                    </g>
                  )),
              )}
              <text x="45" y="224" fill="#929292" fontSize="10">
                {time(history[0]!.timestamp)}
              </text>
              <text
                x="585"
                y="224"
                textAnchor="end"
                fill="#929292"
                fontSize="10"
              >
                {time(last!.timestamp)}
              </text>
            </svg>
            <div className={styles.legend}>
              <span>● รับเข้า</span>
              <span>● ส่งออก</span>
            </div>
          </>
        )}
      </div>
      <p className={styles.hint}>
        ยอดสะสมอาจเริ่มใหม่เมื่อ interface เริ่มใหม่ · ไม่รวมยอดที่ CDN/Bunny
        ให้บริการโดยตรง
      </p>
    </section>
  );
}
export function MonitorPanel() {
  const { data, error } = useMonitor(),
    [sourceId, setSourceId] = useState(""),
    [tab, setTab] = useState<"hosts" | "sites">("sites"),
    [search, setSearch] = useState(""),
    [siteId, setSiteId] = useState<string | null>(null);
  const all =
      data?.rows.flatMap((row) => row.alerts.map((a) => ({ ...a, row }))) ?? [],
    active = all.filter((a) => a.status === "active");
  const selectedSite = data?.sites.find((s) => s.id === siteId);
  const row = siteId
    ? (data?.rows.find(
        (r) => r.source.id === sourceId && r.source.siteIds.includes(siteId),
      ) ?? data?.rows.find((r) => r.source.siteIds.includes(siteId)))
    : (data?.rows.find((r) => r.source.id === sourceId) ?? data?.rows[0]);
  return (
    <section className={styles.page}>
      <header className={styles.heading}>
        <div>
          <span className={styles.kicker}>AURUM / SERVER OVERVIEW</span>
          <h1>Monitor Panel</h1>
        </div>
        <div className={styles.controls}>
          <select
            aria-label="เลือกแหล่งข้อมูล"
            value={row?.source.id ?? ""}
            onChange={(e) => {
              setSourceId(e.target.value);
              setSiteId(null);
            }}
          >
            <option value="" disabled>
              เลือกแหล่งข้อมูล
            </option>
            {data?.rows.map((r) => (
              <option key={r.source.id} value={r.source.id}>
                {r.source.label}
              </option>
            ))}
          </select>
          <span className={styles.live}>
            {error
              ? "การเชื่อมต่อมีปัญหา"
              : data
                ? `อัปเดต ${time(data.generatedAt)}`
                : "กำลังเชื่อมต่อ…"}
          </span>
        </div>
      </header>
      <div className={styles.sourceLine}>
        <strong>
          {selectedSite?.name ?? row?.source.label ?? "ยังไม่เชื่อมแหล่งข้อมูล"}
        </strong>
        <span>
          {row
            ? `${scopes[row.source.scope]} · เก็บทุก ${row.source.intervalSeconds} วินาที`
            : "CPU / Memory / Storage / Network"}
        </span>
        <span
          className={styles.badge}
          data-state={error ? "stale" : row?.state}
        >
          {error
            ? "ข้อมูลอาจล้าสมัย"
            : row?.state === "live"
              ? "● รับข้อมูลล่าสุด"
              : row?.state === "stale"
                ? "ข้อมูลล้าสมัย"
                : "รอการเชื่อมต่อ"}
        </span>
      </div>
      {selectedSite &&
        row &&
        ["host", "hosting-account"].includes(row.source.scope) && (
          <p className={styles.warning}>
            ข้อมูลนี้ใช้ร่วมกันทั้งโฮสต์ ไม่ใช่ CPU/RAM ที่เว็บไซต์นี้ใช้แยกตัว
          </p>
        )}
      <Gauges row={row} />
      <section className={styles.overview}>
        <h2>
          Overview <span>ภาพรวมระบบ</span>
        </h2>
        <div className={styles.summary}>
          <div>
            <span>เว็บไซต์</span>
            <strong>{data?.sites.length ?? "—"}</strong>
            <small>
              เปิดใช้งานใน AURUM{" "}
              {data?.sites.filter((s) => s.isActive).length ?? "—"}
            </small>
          </div>
          <div>
            <span>แหล่งข้อมูล</span>
            <strong>{data?.rows.length ?? "—"}</strong>
            <small>
              รับข้อมูลล่าสุด{" "}
              {data?.rows.filter((r) => r.state === "live").length ?? "—"}
            </small>
          </div>
          <div data-alert={active.length > 0}>
            <span>Alert</span>
            <strong>{active.length}</strong>
            <small>รายการที่ยังไม่คลี่คลาย</small>
          </div>
          <div>
            <span>อัปเดตหน้าจอ</span>
            <strong>
              10 <em>วินาที</em>
            </strong>
            <small>ติดตามเมื่อเปิดหน้านี้</small>
          </div>
          <div>
            <span>แหล่งข้อมูลที่เลือก</span>
            <strong className={styles.sourceName}>
              {row?.source.label ?? "—"}
            </strong>
            <small>
              {row?.history.at(-1)
                ? `วัดล่าสุด ${time(row.history.at(-1)!.timestamp)}`
                : "ยังไม่มีตัวอย่าง"}
            </small>
          </div>
        </div>
      </section>
      {error && (
        <p className={styles.warning} role="alert">
          {error}
        </p>
      )}
      {data && !data.storageReady && (
        <p className={styles.warning}>
          ยังไม่เชื่อม Redis สำหรับ Monitor ·
          ติดต่อผู้ดูแลเพื่อเชื่อมแหล่งข้อมูล
        </p>
      )}
      <div className={styles.workgrid}>
        <section className={styles.directory}>
          <header>
            <h2>เว็บไซต์และโฮสต์</h2>
            <Link href="/admin/sites">จัดการเว็บไซต์ ↗</Link>
          </header>
          <div className={styles.toolbar}>
            <div role="group" aria-label="มุมมอง Monitor">
              <button
                aria-pressed={tab === "sites"}
                onClick={() => setTab("sites")}
              >
                เว็บไซต์
              </button>
              <button
                aria-pressed={tab === "hosts"}
                onClick={() => setTab("hosts")}
              >
                โฮสต์
              </button>
            </div>
            <input
              aria-label="ค้นหาโฮสต์หรือเว็บไซต์"
              placeholder="ค้นหา…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className={styles.directoryList}>
            {tab === "sites"
              ? data?.sites
                  .filter((s) =>
                    s.name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((site) => {
                    const sources = data.rows.filter((r) =>
                      r.source.siteIds.includes(site.id),
                    );
                    return (
                      <button
                        key={site.id}
                        className={styles.directoryRow}
                        aria-pressed={siteId === site.id}
                        onClick={() => setSiteId(site.id)}
                      >
                        <span className={styles.siteIcon}>◎</span>
                        <span>
                          <strong>{site.name}</strong>
                          <small>{site.baseUrl}</small>
                        </span>
                        <span className={styles.badge}>
                          {sources.length
                            ? `${sources.length} แหล่งข้อมูล`
                            : "ยังไม่เชื่อมต่อ"}
                        </span>
                      </button>
                    );
                  })
              : data?.rows
                  .filter((r) =>
                    r.source.label.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((r) => (
                    <button
                      key={r.source.id}
                      className={styles.directoryRow}
                      aria-pressed={!siteId && row?.source.id === r.source.id}
                      onClick={() => {
                        setSourceId(r.source.id);
                        setSiteId(null);
                      }}
                    >
                      <span className={styles.siteIcon}>▤</span>
                      <span>
                        <strong>{r.source.label}</strong>
                        <small>{scopes[r.source.scope]}</small>
                      </span>
                      <span className={styles.badge} data-state={r.state}>
                        {r.state === "live"
                          ? "รับข้อมูลล่าสุด"
                          : r.state === "stale"
                            ? "ล้าสมัย"
                            : "ยังไม่เชื่อมต่อ"}
                      </span>
                    </button>
                  ))}
            {data &&
              !(tab === "sites"
                ? data.sites.some((s) =>
                    s.name.toLowerCase().includes(search.toLowerCase()),
                  )
                : data.rows.some((r) =>
                    r.source.label.toLowerCase().includes(search.toLowerCase()),
                  )) && (
                <p className={styles.empty}>
                  ไม่พบรายการ{search ? "ที่ตรงกับคำค้น" : "ในขณะนี้"}
                </p>
              )}
          </div>
          <footer>
            {selectedSite && !row
              ? `ยังไม่ผูกแหล่งข้อมูล · Site ID: ${selectedSite.id}`
              : "เลือกเว็บไซต์หรือโฮสต์เพื่อดูสถานะและกราฟด้านขวา"}
          </footer>
        </section>
        <Traffic row={row} />
      </div>
      <section className={styles.alertPanel}>
        <header>
          <h2>แจ้งเตือนระบบ</h2>
          <span>
            เตือนเมื่อสูงต่อเนื่อง 3 ตัวอย่าง · คลี่คลายเมื่อค่าต่ำกว่าเกณฑ์ 5%
            จำนวน 2 ตัวอย่าง
          </span>
        </header>
        <div aria-live="polite">
          {active.length ? (
            active.map((a) => (
              <div className={styles.alert} key={a.key}>
                <b>
                  {a.row.source.label} · {names[a.metric]}
                </b>
                <span>
                  {a.metric === "offline"
                    ? "ไม่ได้รับตัวอย่างใหม่ตามกำหนด"
                    : `${a.value === null ? "ยังวัดค่าไม่ได้" : a.value.toFixed(1) + "%"} / เกณฑ์ ${a.threshold}%`}{" "}
                  · ตั้งแต่ {time(a.since)}
                </span>
                <small>
                  {a.row.source.siteIds.length
                    ? `เว็บไซต์ที่เกี่ยวข้อง: ${
                        data?.sites
                          .filter((s) => a.row.source.siteIds.includes(s.id))
                          .map((s) => s.name)
                          .join(", ") || "ตรวจ mapping เว็บไซต์"
                      }`
                    : "แหล่งข้อมูลโฮสต์"}
                </small>
              </div>
            ))
          ) : (
            <p className={styles.hint}>
              {!data
                ? "กำลังตรวจสถานะ…"
                : !data.rows.some((r) => r.state === "live")
                  ? "ยังไม่มีข้อมูลสดเพียงพอสำหรับสรุปสถานะระบบ"
                  : "ไม่พบ Alert ที่ทำงานอยู่ในข้อมูลที่ได้รับ"}
            </p>
          )}
        </div>
        {all.some((a) => a.status === "recovered") && (
          <details>
            <summary>สถานะคลี่คลายล่าสุด</summary>
            {all
              .filter((a) => a.status === "recovered")
              .map((a) => (
                <p className={styles.recovered} key={a.key}>
                  {a.row.source.label} · {names[a.metric]} กลับสู่เกณฑ์ปกติ{" "}
                  {time(a.since)}
                </p>
              ))}
          </details>
        )}
      </section>
      <details className={styles.help}>
        <summary>ความหมายของข้อมูลและเงื่อนไขแจ้งเตือน</summary>
        <p>
          แสดงตัวอย่างล่าสุดสูงสุด 120 จุด ข้อมูลที่ไม่มีตัวอย่างใหม่เกิน 90
          วินาที หรือ 3 รอบเก็บข้อมูลจะขึ้นว่าล้าสมัย เก็บข้อมูลไว้สูงสุด 7
          วันหลังตัวอย่างล่าสุด
        </p>
        <p>
          CPU / Memory / Storage เตือนตามเกณฑ์ของ source ส่วน Bandwidth
          ใช้อัตรารับหรือส่งที่สูงกว่าเทียบกับความจุลิงก์ การมีค่า —
          หมายถึงยังวัดไม่ได้ ไม่ใช่ศูนย์ หากไม่ได้กำหนดความจุลิงก์ ระบบประเมินเพดานจาก Traffic สูงสุดในช่วงกราฟ เผื่อ 25% และปัดขึ้น เพดานนี้ปรับตามข้อมูล ไม่ใช่ความเร็วสูงสุดของผู้ให้บริการหรือโควตารายเดือน และไม่ใช้สร้าง Alert การรับข้อมูลทำงานต่อได้แม้ปิดหน้าเว็บ
        </p>
        <p>
          Alert แสดงเฉพาะใน AURUM และป้าย Monitor Panel ของผู้ดูแล
          แสดงการคลี่คลายล่าสุดต่อ metric ไม่ใช่ประวัติเหตุการณ์ถาวร
        </p>
      </details>
    </section>
  );
}
