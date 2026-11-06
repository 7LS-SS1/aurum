import { z } from "zod";
const percent = z.number().finite().min(0).max(100).nullable();
const bytes = z
  .number()
  .finite()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER)
  .nullable();
export const sampleSchema = z
  .object({
    timestamp: z.string().datetime(),
    cpuPercent: percent,
    memoryUsed: bytes,
    memoryTotal: bytes,
    diskUsed: bytes,
    diskTotal: bytes,
    rxBytesPerSecond: bytes,
    txBytesPerSecond: bytes,
    rxBytes: bytes,
    txBytes: bytes,
  })
  .strict()
  .refine(
    (s) =>
      (s.memoryUsed === null ||
        s.memoryTotal === null ||
        s.memoryUsed <= s.memoryTotal) &&
      (s.diskUsed === null ||
        s.diskTotal === null ||
        s.diskUsed <= s.diskTotal),
    "used_exceeds_capacity",
  );
export type Sample = z.infer<typeof sampleSchema>;
export const sourceSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,64}$/),
  label: z.string().min(1).max(100),
  scope: z.enum(["host", "container", "hosting-account", "site"]),
  siteIds: z.array(z.string().min(1).max(100)).max(100).default([]),
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  capacityMbps: z.number().positive().max(1000000).optional(),
  intervalSeconds: z.number().int().min(10).max(3600).default(15),
  thresholds: z
    .object({
      cpu: z.number().min(1).max(100).default(85),
      memory: z.number().min(1).max(100).default(90),
      disk: z.number().min(1).max(100).default(90),
      bandwidth: z.number().min(1).max(100).default(80),
    })
    .default({ cpu: 85, memory: 90, disk: 90, bandwidth: 80 }),
});
export type Source = z.infer<typeof sourceSchema>;
export type PublicSource = Omit<Source, "tokenHash">;
export type Metric = "cpu" | "memory" | "disk" | "bandwidth";
export type Alert = {
  key: string;
  metric: Metric | "offline";
  status: "active" | "recovered";
  since: string;
  value: number | null;
  threshold: number | null;
};
export function values(
  s: Sample,
  capacityMbps?: number,
): Record<Metric, number | null> {
  return {
    cpu: s.cpuPercent,
    memory:
      s.memoryUsed !== null && s.memoryTotal
        ? (s.memoryUsed / s.memoryTotal) * 100
        : null,
    disk:
      s.diskUsed !== null && s.diskTotal
        ? (s.diskUsed / s.diskTotal) * 100
        : null,
    bandwidth:
      capacityMbps && s.rxBytesPerSecond !== null && s.txBytesPerSecond !== null
        ? Math.min(
            100000,
            ((Math.max(s.rxBytesPerSecond, s.txBytesPerSecond) * 8) /
              (capacityMbps * 1e6)) *
              100,
          )
        : null,
  };
}
export type Tracker = {
  high: number;
  low: number;
  active: boolean;
  since: string;
  previous: number;
  alert?: Alert;
};
export type Trackers = Partial<Record<Metric, Tracker>>;
/** Persisted hysteresis survives the bounded graph window and application restarts. */
export function advance(
  source: PublicSource,
  sample: Sample,
  previous: Trackers = {},
): Trackers {
  const next: Trackers = {};
  for (const metric of ["cpu", "memory", "disk", "bandwidth"] as const) {
    const old = previous[metric],
      state: Tracker = old
        ? { ...old, alert: old.alert ? { ...old.alert } : undefined }
        : { high: 0, low: 0, active: false, since: "", previous: 0 };
    const time = Date.parse(sample.timestamp),
      value = values(sample, source.capacityMbps)[metric];
    if (time - state.previous > source.intervalSeconds * 3000) {
      state.high = 0;
      state.low = 0;
    }
    state.previous = time;
    if (value === null) {
      state.high = 0;
      state.low = 0;
    } else if (value >= source.thresholds[metric]) {
      state.high++;
      state.low = 0;
      if (state.high === 1) state.since = sample.timestamp;
      if (!state.active && state.high >= 3) {
        state.active = true;
        state.alert = {
          key: source.id + ":" + metric,
          metric,
          status: "active",
          since: state.since,
          value,
          threshold: source.thresholds[metric],
        };
      }
      if (state.active && state.alert) state.alert.value = value;
    } else {
      state.high = 0;
      state.low = value < source.thresholds[metric] - 5 ? state.low + 1 : 0;
      if (state.active && state.low >= 2) {
        state.active = false;
        state.alert = {
          key: source.id + ":" + metric,
          metric,
          status: "recovered",
          since: sample.timestamp,
          value,
          threshold: source.thresholds[metric],
        };
      }
    }
    if (state.active && state.alert) state.alert.value = value;
    next[metric] = state;
  }
  return next;
}
export function currentAlerts(
  source: PublicSource,
  trackers: Trackers,
  last: Sample | undefined,
  now = Date.now(),
): Alert[] {
  const alerts = Object.values(trackers).flatMap((t) =>
    t.alert ? [t.alert] : [],
  );
  if (
    last &&
    now - Date.parse(last.timestamp) >
      Math.max(90000, source.intervalSeconds * 3000)
  )
    alerts.push({
      key: source.id + ":offline",
      metric: "offline",
      status: "active",
      since: last.timestamp,
      value: null,
      threshold: null,
    });
  return alerts;
}
export function evaluate(
  source: PublicSource,
  history: Sample[],
  now = Date.now(),
): Alert[] {
  return currentAlerts(
    source,
    history.reduce(
      (state, sample) => advance(source, sample, state),
      {} as Trackers,
    ),
    history.at(-1),
    now,
  );
}
export type MonitorRow = {
  source: PublicSource;
  history: Sample[];
  alerts: Alert[];
  state: "live" | "stale" | "unconnected";
};
export type MonitorSnapshot = {
  generatedAt: string;
  rows: MonitorRow[];
  sites: { id: string; name: string; baseUrl: string; isActive: boolean }[];
  storageReady: boolean;
};
