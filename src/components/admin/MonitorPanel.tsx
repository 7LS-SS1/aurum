"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import {
  values,
  type MonitorSnapshot,
  type MonitorRow,
  type Metric,
} from "@/lib/monitor/types";
import styles from "./MonitorPanel.module.css";
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
  const history = row.history,
    start = history[0] ? Date.parse(history[0].timestamp) : 0,
    end = history.at(-1) ? Date.parse(history.at(-1)!.timestamp) : start;
  const points = history.map((s) => ({
    time: Date.parse(s.timestamp),
    x:
      end > start
        ? ((Date.parse(s.timestamp) - start) / (end - start)) * 600
        : 0,
    y: values(s, row.source.capacityMbps)[metric],
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
    <div className={styles.chart}>
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
        <path
          d={`M0 ${100 - row.source.thresholds[metric]}H600`}
          stroke="#e9a055"
          strokeDasharray="5 5"
          fill="none"
        />
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
        <span>0–100% · เส้นประ = เกณฑ์เตือน</span>
        <span>{history.at(-1) ? time(history.at(-1)!.timestamp) : "—"}</span>
      </div>
    </div>
  );
}
function Resource({ row }: { row: MonitorRow }) {
  const [metric, setMetric] = useState<Metric>("cpu"),
    last = row.history.at(-1),
    v = last ? values(last, row.source.capacityMbps) : null;
  const details: Record<Metric, string> = {
    cpu: "การใช้งาน CPU",
    memory: last
      ? `${bytes(last.memoryUsed)} / ${bytes(last.memoryTotal)}`
      : "—",
    disk: last ? `${bytes(last.diskUsed)} / ${bytes(last.diskTotal)}` : "—",
    bandwidth: row.source.capacityMbps
      ? `ความจุ ${row.source.capacityMbps} Mbps / ทิศทาง`
      : "ยังไม่ระบุความจุลิงก์",
  };
  return (
    <article className={styles.resource}>
      <header>
        <div>
          <h3>{row.source.label}</h3>
          <p>
            {scopes[row.source.scope]} · เก็บทุก {row.source.intervalSeconds}{" "}
            วินาที
          </p>
        </div>
        <span className={styles.badge} data-state={row.state}>
          {row.state === "live"
            ? "● รับข้อมูลล่าสุด"
            : row.state === "stale"
              ? "ข้อมูลล้าสมัย"
              : "ยังไม่ได้เชื่อมต่อ"}
        </span>
      </header>
      <div className={styles.metrics}>
        {(["cpu", "memory", "disk", "bandwidth"] as Metric[]).map((key) => (
          <button
            key={key}
            aria-pressed={metric === key}
            onClick={() => setMetric(key)}
          >
            <span>{names[key]}</span>
            <strong>{v?.[key] != null ? `${v[key]!.toFixed(1)}%` : "—"}</strong>
            <small>{details[key]}</small>
          </button>
        ))}
      </div>
      <Chart row={row} metric={metric} />
      <div className={styles.traffic}>
        <span>
          ↓ รับเข้า <b>{mbps(last?.rxBytesPerSecond)}</b>
        </span>
        <span>
          ↑ ส่งออก <b>{mbps(last?.txBytesPerSecond)}</b>
        </span>
        <span>
          Traffic สะสมของ counter{" "}
          <b>
            ↓ {bytes(last?.rxBytes)} · ↑ {bytes(last?.txBytes)}
          </b>
        </span>
      </div>
      <p className={styles.hint}>
        {last ? `วัดล่าสุด ${time(last.timestamp)}` : "รอ collector ส่งข้อมูล"}{" "}
        · Traffic อาจเริ่มนับใหม่เมื่อเครื่องหรือ interface เริ่มใหม่
        และไม่ใช่ยอด CDN/Bunny หรือโควตารายเดือน
      </p>
    </article>
  );
}
export function MonitorPanel() {
  const { data, error } = useMonitor(),
    [tab, setTab] = useState<"hosts" | "sites">("hosts"),
    [search, setSearch] = useState("");
  const all =
      data?.rows.flatMap((row) => row.alerts.map((a) => ({ ...a, row }))) ?? [],
    active = all.filter((a) => a.status === "active");
  return (
    <section className={styles.page}>
      <header className={styles.heading}>
        <div>
          <span className={styles.kicker}>AURUM / OPERATIONS</span>
          <h1>Monitor Panel</h1>
          <p>สถานะโฮสต์และเว็บไซต์ พร้อมแจ้งเตือนเมื่อการใช้งานเกินเกณฑ์</p>
        </div>
        <span className={styles.live}>
          {error
            ? "การเชื่อมต่อมีปัญหา"
            : data
              ? `อัปเดต ${time(data.generatedAt)}`
              : "กำลังเชื่อมต่อ…"}
        </span>
      </header>
      <div className={styles.summary}>
        <div>
          <span>แหล่งข้อมูลที่เชื่อมต่อ</span>
          <strong>
            {data?.rows.filter((r) => r.state === "live").length ?? "—"}
            <small> / {data?.rows.length ?? 0}</small>
          </strong>
        </div>
        <div>
          <span>เว็บไซต์ทั้งหมด</span>
          <strong>{data?.sites.length ?? "—"}</strong>
        </div>
        <div data-alert={active.length > 0}>
          <span>Alert ที่ยังไม่คลี่คลาย</span>
          <strong>{active.length}</strong>
        </div>
        <div>
          <span>การอัปเดตหน้าจอ</span>
          <strong>
            10 <small>วินาที</small>
          </strong>
        </div>
      </div>
      {error && (
        <p className={styles.warning} role="alert">
          {error}
        </p>
      )}
      {data && !data.storageReady && (
        <p className={styles.warning}>
          ยังไม่เชื่อม Redis สำหรับ Monitor · กำหนด MONITOR_REDIS_URL หรือ
          REDIS_URL ก่อนรับข้อมูล
          ระบบจะไม่เก็บตัวเลขชั่วคราวแล้วแสดงเสมือนข้อมูลจริง
        </p>
      )}
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
      <div className={styles.toolbar}>
        <div role="group" aria-label="มุมมอง Monitor">
          <button
            aria-pressed={tab === "hosts"}
            onClick={() => setTab("hosts")}
          >
            Host Panel
          </button>
          <button
            aria-pressed={tab === "sites"}
            onClick={() => setTab("sites")}
          >
            แยกรายเว็บไซต์
          </button>
        </div>
        <input
          aria-label="ค้นหาโฮสต์หรือเว็บไซต์"
          placeholder="ค้นหาโฮสต์ / เว็บไซต์…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {tab === "hosts"
        ? data?.rows
            .filter((r) =>
              r.source.label.toLowerCase().includes(search.toLowerCase()),
            )
            .map((row) => <Resource key={row.source.id} row={row} />)
        : data?.sites
            .filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
            .map((site) => {
              const rows = data.rows.filter((r) =>
                r.source.siteIds.includes(site.id),
              );
              return (
                <section className={styles.site} key={site.id}>
                  <header>
                    <h2>{site.name}</h2>
                    <span>
                      {site.baseUrl} {!site.isActive && "· ปิดใช้งานใน AURUM"}
                    </span>
                  </header>
                  {rows.length ? (
                    rows.map((row) => (
                      <div key={row.source.id}>
                        {["host", "hosting-account"].includes(
                          row.source.scope,
                        ) && (
                          <p className={styles.warning}>
                            ค่านี้ใช้ร่วมกับเว็บไซต์อื่นบนโฮสต์ ไม่ใช่ CPU/RAM
                            ที่เว็บไซต์นี้ใช้แยกตัว
                          </p>
                        )}
                        <Resource row={row} />
                      </div>
                    ))
                  ) : (
                    <p className={styles.hint}>
                      ยังไม่ผูกแหล่งข้อมูลกับเว็บไซต์นี้ · Site ID:{" "}
                      <code>{site.id}</code>
                    </p>
                  )}
                </section>
              );
            })}
      {data && !data.rows.length && (
        <div className={styles.empty}>
          <h2>เริ่มเชื่อมแหล่งข้อมูล</h2>
          <p>
            ติดตั้ง collector บน VPS ที่คุณดูแล แล้วกำหนด source และ Site ID
            เพื่อเริ่มรับ CPU, Memory, Storage และ Network
          </p>
          <p>
            Shared hosting ต้องใช้แหล่งข้อมูลที่ผู้ให้บริการอนุญาต
            ค่าที่อ่านไม่ได้จะแสดง —
          </p>
        </div>
      )}
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
          หมายถึงยังวัดไม่ได้ ไม่ใช่ศูนย์ การรับข้อมูลทำงานต่อได้แม้ปิดหน้าเว็บ
        </p>
        <p>
          Alert แสดงเฉพาะใน AURUM และป้าย Monitor Panel ของผู้ดูแล
          แสดงการคลี่คลายล่าสุดต่อ metric ไม่ใช่ประวัติเหตุการณ์ถาวร
        </p>
      </details>
    </section>
  );
}
