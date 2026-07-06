import { describe, it, expect } from "vitest";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
process.env.AUTH_SECRET ??= "a".repeat(32);
process.env.ENCRYPTION_KEY ??= "0".repeat(64);
process.env.UPSTASH_REDIS_REST_URL = "";
process.env.UPSTASH_REDIS_REST_TOKEN = "";

const { rateLimit, clientIp } = await import("./rate-limit");

describe("rateLimit (in-memory fallback, no Upstash configured)", () => {
  it("allows requests up to the limit", async () => {
    const key = "test:allow:" + Math.random();
    const r1 = await rateLimit(key, { limit: 2, windowMs: 60_000 });
    const r2 = await rateLimit(key, { limit: 2, windowMs: 60_000 });
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(r2.remaining).toBe(0);
  });

  it("rejects once the limit is exceeded within the window", async () => {
    const key = "test:reject:" + Math.random();
    await rateLimit(key, { limit: 1, windowMs: 60_000 });
    const second = await rateLimit(key, { limit: 1, windowMs: 60_000 });
    expect(second.success).toBe(false);
    expect(second.remaining).toBe(0);
  });

  it("tracks separate identifiers independently", async () => {
    const keyA = "test:iso:a:" + Math.random();
    const keyB = "test:iso:b:" + Math.random();
    await rateLimit(keyA, { limit: 1, windowMs: 60_000 });
    const resultB = await rateLimit(keyB, { limit: 1, windowMs: 60_000 });
    expect(resultB.success).toBe(true);
  });

  it("defaults to limit 20 / 60s when no options are given", async () => {
    const key = "test:default:" + Math.random();
    const result = await rateLimit(key);
    expect(result.limit).toBe(20);
    expect(result.success).toBe(true);
  });
});

describe("clientIp", () => {
  it("takes the first address from a comma-separated X-Forwarded-For", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
    expect(clientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to X-Real-IP when X-Forwarded-For is absent", () => {
    const req = new Request("http://x", { headers: { "x-real-ip": "9.9.9.9" } });
    expect(clientIp(req)).toBe("9.9.9.9");
  });

  it("returns 'unknown' when neither header is present", () => {
    const req = new Request("http://x", {});
    expect(clientIp(req)).toBe("unknown");
  });
});
