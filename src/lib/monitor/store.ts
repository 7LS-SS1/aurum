import { createClient } from "redis";
import { ApiError } from "@/lib/api-response";
import { advance, type Sample, type Source, type Trackers } from "./types";
const makeClient = (url: string) =>
  createClient({
    url,
    disableOfflineQueue: true,
    socket: { connectTimeout: 3000, reconnectStrategy: false },
  });
let connection: ReturnType<typeof makeClient> | undefined;
let opening: Promise<ReturnType<typeof makeClient>> | undefined;
export const storageConfigured = () =>
  Boolean(process.env.MONITOR_REDIS_URL || process.env.REDIS_URL);
async function client(): Promise<ReturnType<typeof makeClient>> {
  if (connection?.isReady) return connection;
  if (opening) return opening;
  const url = process.env.MONITOR_REDIS_URL || process.env.REDIS_URL;
  if (!url) throw new ApiError("monitor_redis_not_configured", 503);
  opening = (async () => {
    const redis = makeClient(url);
    redis.on("error", () => {});
    try {
      await redis.connect();
      connection = redis;
      return redis;
    } catch {
      if (redis.isOpen) redis.destroy();
      throw new ApiError("monitor_storage_unavailable", 503);
    }
  })();
  try {
    return await opening;
  } finally {
    opening = undefined;
  }
}
async function command<T>(
  fn: (c: Awaited<ReturnType<typeof client>>) => Promise<T>,
): Promise<T> {
  const c = await client();
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      fn(c),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          if (c.isOpen) c.destroy();
          reject(new ApiError("monitor_storage_unavailable", 503));
        }, 3000);
      }),
    ]);
  } catch {
    throw new ApiError("monitor_storage_unavailable", 503);
  } finally {
    clearTimeout(timer!);
  }
}
const key = (id: string) => `aurum:monitor:v1:${id}`;
export type RecordState = {
  history: Sample[];
  trackers: Trackers;
  policy: string;
};
// Optimistic CAS atomically saves sample + alert state; bounded writes never touch other namespaces.
const SCRIPT = `local old=redis.call('GET',KEYS[1]) or ''
if old~=ARGV[1] then return 0 end
redis.call('SET',KEYS[1],ARGV[2],'EX',604800)
return 1`;
export async function saveSample(
  source: Source,
  sample: Sample,
): Promise<number> {
  return command(async (c) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const raw = await c.get(key(source.id));
      const old: RecordState = raw
        ? JSON.parse(raw)
        : { history: [], trackers: {}, policy: "" };
      const last = old.history.at(-1);
      if (
        last &&
        Date.parse(sample.timestamp) - Date.parse(last.timestamp) <
          source.intervalSeconds * 800
      )
        return 0;
      const policy = JSON.stringify([
        source.thresholds,
        source.capacityMbps,
        source.intervalSeconds,
      ]);
      const next: RecordState = {
        history: [...old.history, sample].slice(-120),
        trackers: advance(
          source,
          sample,
          policy === old.policy ? old.trackers : {},
        ),
        policy,
      };
      if (
        (await c.eval(SCRIPT, {
          keys: [key(source.id)],
          arguments: [raw ?? "", JSON.stringify(next)],
        })) === 1
      )
        return 1;
    }
    throw new Error("concurrent_sample_conflict");
  });
}
export async function histories(ids: string[]): Promise<RecordState[]> {
  if (!ids.length) return [];
  return command(async (c) =>
    (await c.mGet(ids.map(key))).map((raw) =>
      raw ? JSON.parse(raw) : { history: [], trackers: {}, policy: "" },
    ),
  );
}
