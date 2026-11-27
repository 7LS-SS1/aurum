import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { networkContext, readLimited } from "./network";
import type { SafeFetchOptions } from "@/lib/safe-http";

describe("scanner source policies", () => {
  beforeEach(() => { vi.stubEnv("SOURCE_SCANNER_CONTACT_URL", "https://aurum.test/contact"); });
  afterEach(() => { vi.unstubAllEnvs(); });
  function transport(robots: string, status = 200) {
    const calls: string[] = [];
    const fetcher = vi.fn(async (raw: string, _signal: AbortSignal, options: SafeFetchOptions = {}) => {
      await options.beforeRequest?.(new URL(raw));
      calls.push(raw);
      return new Response(raw.endsWith("/robots.txt") ? robots : "fixture", { status: raw.endsWith("/robots.txt") ? status : 200 });
    });
    return { calls, fetcher };
  }
  it("checks robots before a page and honors specific allow rules", async () => {
    const t = transport("User-agent: *\nDisallow: /private\nAllow: /private/public$");
    const fetcher = networkContext(new AbortController().signal, t.fetcher)(["catalog.test"], 0);
    await expect(fetcher("https://catalog.test/private/video")).rejects.toThrow(/ROBOTS_DENIED/);
    expect(t.calls).toEqual(["https://catalog.test/robots.txt"]);
    await expect(fetcher("https://catalog.test/private/public")).resolves.toBeInstanceOf(Response);
    expect(t.calls.filter((u) => u.endsWith("robots.txt"))).toHaveLength(1);
  });
  it("does not treat robots 403, 429 or 5xx as permission", async () => {
    for (const status of [403, 429, 500]) {
      const t = transport("", status); const fetcher = networkContext(new AbortController().signal, t.fetcher)(["catalog.test"], 0);
      await expect(fetcher("https://catalog.test/video")).rejects.toThrow(status === 429 ? /RATE_LIMITED/ : /ROBOTS_UNAVAILABLE/);
      expect(t.calls).toHaveLength(1);
    }
  });
  it("rejects a redirect host before contacting it", async () => {
    const fetcher = vi.fn(async (raw: string, _signal: AbortSignal, options: SafeFetchOptions = {}) => {
      await options.beforeRequest?.(new URL(raw));
      if (raw.endsWith("robots.txt")) return new Response("");
      await options.beforeRequest?.(new URL("https://127.0.0.1/private"));
      throw new Error("must not contact redirect");
    });
    await expect(networkContext(new AbortController().signal, fetcher)(["catalog.test"], 0)("https://catalog.test/video")).rejects.toThrow(/INVALID_URL/);
  });
  it("enforces pacing and aborts it on STOP", async () => {
    const t = transport(""); const local = new AbortController();
    const fetcher = networkContext(new AbortController().signal, t.fetcher)(["catalog.test"], 1000, local.signal);
    const pending = fetcher("https://catalog.test/video");
    setTimeout(() => local.abort(new Error("stopped")), 10);
    await expect(pending).rejects.toThrow("stopped"); expect(t.calls).toHaveLength(0);
  });
  it("limits chunked response bodies", async () => {
    await expect(readLimited(new Response("oversized"), 3)).rejects.toThrow(/TOO_LARGE/);
  });
  it("persists Retry-After and prevents requests to that host in later runs", async () => {
    const onRateLimit = vi.fn().mockResolvedValue(undefined);
    const transport = vi.fn(async (raw: string, _signal: AbortSignal, options: SafeFetchOptions = {}) => {
      await options.beforeRequest?.(new URL(raw));
      return raw.endsWith("robots.txt") ? new Response("") : new Response("", { status: 429, headers: { "retry-after": "120" } });
    });
    const before = Date.now();
    const fetcher = networkContext(new AbortController().signal, transport, { backoffs: new Map(), onRateLimit })(["catalog.test"], 0);
    await expect(fetcher("https://catalog.test/video")).rejects.toThrow(/RATE_LIMITED/);
    const [host, until] = onRateLimit.mock.calls[0]!;
    expect(host).toBe("catalog.test"); expect(until.getTime()).toBeGreaterThanOrEqual(before + 120000);
    transport.mockClear();
    const later = networkContext(new AbortController().signal, transport, { backoffs: new Map([[host, until]]), onRateLimit })(["catalog.test"], 0);
    await expect(later("https://catalog.test/another")).rejects.toThrow(/RATE_LIMITED/);
    expect(transport).toHaveBeenCalledTimes(1); // policy rejects before the mocked transport can send a request
  });
});
