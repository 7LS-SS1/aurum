import { createHash } from "node:crypto";
import { env } from "@/lib/env";

type CacheEntry = { value: unknown; expiresAt: number };
type UpstashClient = InstanceType<(typeof import("@upstash/redis"))["Redis"]>;
type NodeRedisClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
  scan(cursor: string, options: { MATCH: string; COUNT: number }): Promise<{ cursor: string; keys: string[] }>;
  del(keys: string[]): Promise<number>;
};
type CacheBackend =
  | { kind: "upstash"; client: UpstashClient }
  | { kind: "redis"; client: NodeRedisClient };

const memory = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();
let redisPromise: Promise<CacheBackend | null> | undefined;
let redisBackend: CacheBackend | null = null;
let redisRetryAt = 0;

async function getRedis(): Promise<CacheBackend | null> {
  if (process.env.NODE_ENV === "test") return null;
  if (Date.now() < redisRetryAt) return null;
  if (redisBackend) return redisBackend;
  if (redisPromise) return redisPromise;

  redisPromise = (async () => {
    const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, REDIS_URL } = env();
    try {
      if (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN) {
        const { Redis } = await import("@upstash/redis");
        return {
          kind: "upstash",
          client: new Redis({ url: UPSTASH_REDIS_REST_URL, token: UPSTASH_REDIS_REST_TOKEN }),
        };
      }
      if (REDIS_URL) {
        const { createClient } = await import("redis");
        const client = createClient({
          url: REDIS_URL,
          socket: {
            connectTimeout: 5_000,
            reconnectStrategy: (retries) => (retries >= 3 ? false : Math.min(retries * 100, 1_000)),
          },
        });
        client.on("error", () => {
          redisRetryAt = Date.now() + 30_000;
        });
        await client.connect();
        return { kind: "redis", client: client as unknown as NodeRedisClient };
      }
      return null;
    } catch {
      redisRetryAt = Date.now() + 30_000;
      return null;
    }
  })();

  const pending = redisPromise;
  try {
    const backend = await pending;
    if (backend) redisBackend = backend;
    return backend;
  } finally {
    if (redisPromise === pending) redisPromise = undefined;
  }
}

async function redisGet<T>(backend: CacheBackend, key: string): Promise<T | null> {
  if (backend.kind === "upstash") return backend.client.get<T>(key);
  const value = await backend.client.get(key);
  return value === null ? null : (JSON.parse(value) as T);
}

async function redisSet(backend: CacheBackend, key: string, value: unknown, ttlSeconds: number) {
  if (backend.kind === "upstash") {
    await backend.client.set(key, value, { ex: ttlSeconds });
  } else {
    await backend.client.set(key, JSON.stringify(value), { EX: ttlSeconds });
  }
}

async function redisDeleteNamespace(backend: CacheBackend, prefix: string) {
  if (backend.kind === "upstash") {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await backend.client.scan(cursor, { match: `${prefix}*`, count: 100 });
      cursor = nextCursor;
      if (keys.length) await backend.client.del(...keys);
    } while (cursor !== "0");
    return;
  }

  let cursor = "0";
  do {
    const result = await backend.client.scan(cursor, { MATCH: `${prefix}*`, COUNT: 100 });
    cursor = result.cursor;
    if (result.keys.length) await backend.client.del(result.keys);
  } while (cursor !== "0");
}

function digest(parts: readonly unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("base64url").slice(0, 24);
}

function fullKey(namespace: string, parts: readonly unknown[]): string {
  return `aurum:${namespace}:${digest(parts)}`;
}

function remember(key: string, value: unknown, ttlSeconds: number) {
  memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  if (memory.size > 1_000) {
    const oldest = memory.keys().next().value;
    if (oldest) memory.delete(oldest);
  }
}

/**
 * Read-through cache for public, non-user-specific data. Redis failures never
 * fail a request: the process-local TTL cache and source function remain the
 * fallback. Concurrent misses in one instance share the same source promise.
 */
export async function cachePublic<T>(
  namespace: string,
  parts: readonly unknown[],
  ttlSeconds: number,
  source: () => Promise<T>,
): Promise<T> {
  const key = fullKey(namespace, parts);
  const local = memory.get(key);
  if (local && local.expiresAt > Date.now()) return local.value as T;
  if (local) memory.delete(key);

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const work = (async () => {
    const redis = await getRedis();
    if (redis) {
      try {
        const hit = await redisGet<T>(redis, key);
        if (hit !== null && hit !== undefined) {
          remember(key, hit, Math.min(ttlSeconds, 15));
          return hit;
        }
      } catch {
        redisRetryAt = Date.now() + 30_000;
      }
    }

    const value = await source();
    remember(key, value, Math.min(ttlSeconds, 15));
    if (redis) {
      try {
        await redisSet(redis, key, value, ttlSeconds);
      } catch {
        redisRetryAt = Date.now() + 30_000;
      }
    }
    return value;
  })();

  inflight.set(key, work);
  try {
    return await work;
  } finally {
    inflight.delete(key);
  }
}

/** Invalidates every cached variant in a low-cardinality namespace. */
export async function invalidatePublicCache(namespace: string): Promise<void> {
  const prefix = `aurum:${namespace}:`;
  for (const key of memory.keys()) if (key.startsWith(prefix)) memory.delete(key);

  const redis = await getRedis();
  if (!redis) return;
  try {
    await redisDeleteNamespace(redis, prefix);
  } catch {
    redisRetryAt = Date.now() + 30_000;
  }
}

export async function invalidatePublicMovieCaches(): Promise<void> {
  await Promise.all([invalidatePublicCache("catalog"), invalidatePublicCache("movie")]);
}
