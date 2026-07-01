import { env } from "./env";

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
}

/**
 * In-memory sliding-window limiter. Good enough for a single Node.js
 * instance (local dev, small deployments) but does NOT share state across
 * serverless instances — configure UPSTASH_REDIS_REST_URL/TOKEN in any
 * multi-instance deployment so limits are enforced globally, not per-lambda.
 */
const buckets = new Map<string, number[]>();

function inMemoryLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;
  const hits = (buckets.get(key) ?? []).filter((t) => t > windowStart);
  hits.push(now);
  buckets.set(key, hits);

  // Bound memory: drop the oldest bucket occasionally instead of growing forever.
  if (buckets.size > 50_000) {
    const oldestKey = buckets.keys().next().value;
    if (oldestKey) buckets.delete(oldestKey);
  }

  return {
    success: hits.length <= limit,
    limit,
    remaining: Math.max(0, limit - hits.length),
    resetMs: windowStart + windowMs,
  };
}

let upstash: { limit: (key: string) => Promise<RateLimitResult> } | null | undefined;

async function getUpstash() {
  if (upstash !== undefined) return upstash;
  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = env();
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
    upstash = null;
    return upstash;
  }
  try {
    const [{ Ratelimit }, { Redis }] = await Promise.all([
      import("@upstash/ratelimit"),
      import("@upstash/redis"),
    ]);
    const redis = new Redis({ url: UPSTASH_REDIS_REST_URL, token: UPSTASH_REDIS_REST_TOKEN });
    const limiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, "60 s") });
    upstash = {
      limit: async (key: string) => {
        const r = await limiter.limit(key);
        return { success: r.success, limit: r.limit, remaining: r.remaining, resetMs: r.reset };
      },
    };
  } catch {
    upstash = null; // optional dep not installed — silently fall back
  }
  return upstash;
}

/**
 * @param identifier stable per-caller key, e.g. `ip:route` or `userId:route`
 */
export async function rateLimit(
  identifier: string,
  { limit = 20, windowMs = 60_000 }: { limit?: number; windowMs?: number } = {},
): Promise<RateLimitResult> {
  const client = await getUpstash();
  if (client) return client.limit(identifier);
  return inMemoryLimit(identifier, limit, windowMs);
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
}
