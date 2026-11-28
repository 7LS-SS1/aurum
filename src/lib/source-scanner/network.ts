import robotsParser from "robots-parser";
import { setTimeout as delay } from "node:timers/promises";
import { safeFetch } from "@/lib/safe-http";
import { allowedUrl, ScannerError } from "./contracts";

export async function readLimited(res: Response, limit: number) {
  if (!res.body) throw new ScannerError("SOURCE_HTTP");
  if (Number(res.headers.get("content-length")) > limit) { await res.body.cancel(); throw new ScannerError("TOO_LARGE"); }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > limit) throw new ScannerError("TOO_LARGE");
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { await reader.cancel().catch(() => undefined); }
}

export type SourceFetch = (url: string, method?: "POST") => Promise<Response>;
export interface HostBackoffPolicy { backoffs: Map<string, Date>; onRateLimit: (host: string, until: Date) => Promise<void> }
/** One network context is shared by the globally leased scanner run. */
export function networkContext(signal: AbortSignal, fetcher = safeFetch, cooldown?: HostBackoffPolicy) {
  const lastRequest = new Map<string, number>();
  const robots = new Map<string, ReturnType<typeof robotsParser>>();
  const backoffs = cooldown?.backoffs ?? new Map<string, Date>();
  function checkBackoff(host: string) {
    const until = backoffs.get(host);
    if (until && until.getTime() > Date.now()) throw new ScannerError("RATE_LIMITED", 422, until);
  }
  async function rateLimited(res: Response, fallback: string): Promise<never> {
    const header = res.headers.get("retry-after") || "60";
    const timestamp = /^\d+$/.test(header) ? Date.now() + Number(header) * 1000 : Date.parse(header);
    const until = new Date(Number.isFinite(timestamp) && timestamp < 8.64e15 ? Math.max(Date.now() + 30_000, timestamp) : Date.now() + 60_000);
    const host = new URL(res.url || fallback).hostname;
    backoffs.set(host, until); await res.body?.cancel();
    await cooldown?.onRateLimit(host, until);
    throw new ScannerError("RATE_LIMITED", 422, until);
  }
  const configured = process.env.SOURCE_SCANNER_CONTACT_URL || process.env.PUBLIC_APP_ORIGIN;
  let userAgent = "AURUM-Scanner/1.0";
  if (configured) {
    try {
      const contact = new URL(configured);
      if (!/^https?:$/.test(contact.protocol) || contact.username || contact.password) throw new Error("invalid contact");
      userAgent += ` (+${contact.origin}${contact.pathname})`;
    } catch { throw new ScannerError("INTERNAL", 503); }
  }
  async function throttle(url: URL, ms: number, requestSignal: AbortSignal) {
    const wait = ms - (Date.now() - (lastRequest.get(url.hostname) ?? (Date.now())));
    if (wait > 0) await delay(wait, undefined, { signal: requestSignal });
    lastRequest.set(url.hostname, Date.now());
  }
  return (hosts: string[], interval: number, requestSignal = signal): SourceFetch => {
    const activeSignal = AbortSignal.any([signal, requestSignal]);
    const checkHost = (url: URL) => { allowedUrl(url.toString(), hosts); checkBackoff(url.hostname); };
    async function policy(url: URL) {
      checkHost(url);
      let rules = robots.get(url.origin);
      if (!rules) {
        const robotsUrl = new URL("/robots.txt", url).toString();
        const response = await fetcher(robotsUrl, activeSignal, {
          userAgent, allowErrorStatus: true,
          beforeRequest: async (hop) => { checkHost(hop); await throttle(hop, interval, activeSignal); },
        });
        if (response.status === 429) await rateLimited(response, robotsUrl);
        if (response.status === 404 || response.status === 410) { await response.body?.cancel(); rules = robotsParser(robotsUrl, ""); }
        else if (response.ok) rules = robotsParser(robotsUrl, (await readLimited(response, 512_000)).toString("utf8"));
        else { await response.body?.cancel(); throw new ScannerError("ROBOTS_UNAVAILABLE"); }
        robots.set(url.origin, rules);
      }
      if (rules.isAllowed(url.toString(), "AURUM-Scanner") === false) throw new ScannerError("ROBOTS_DENIED");
      await throttle(url, Math.max(interval, (rules.getCrawlDelay("AURUM-Scanner") ?? 0) * 1000), activeSignal);
    }
    return async (raw, method) => {
      try {
        const response = await fetcher(allowedUrl(raw, hosts), activeSignal, { userAgent, allowErrorStatus: true, beforeRequest: policy, ...(method ? { method } : {}) });
        if (response.status === 429) await rateLimited(response, raw);
        if (!response.ok || !response.body) { await response.body?.cancel(); throw new ScannerError("SOURCE_HTTP"); }
        return response;
      } catch (error) {
        if (error instanceof ScannerError) throw error;
        if (activeSignal.aborted) throw activeSignal.reason;
        if (error instanceof Error && error.message === "ปลายทางไม่ใช่ที่อยู่สาธารณะ") throw new ScannerError("PRIVATE_ADDRESS");
        throw new ScannerError("SOURCE_HTTP");
      }
    };
  };
}
