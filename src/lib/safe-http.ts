import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import { Readable } from "node:stream";

const blocked = new BlockList();
for (const [net, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3]] as const) blocked.addSubnet(net, prefix, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
for (const [net, prefix] of [["2001::", 32], ["2001:db8::", 32], ["2002::", 16]] as const) blocked.addSubnet(net, prefix, "ipv6");
export function isPublicAddress(raw: string) {
  const family = isIP(raw);
  if (!family) return false;
  if (family === 4) return !blocked.check(raw, "ipv4");
  // Includes IPv4-mapped hex encodings and transition/local IPv6 ranges.
  return globalV6.check(raw, "ipv6") && !blocked.check(raw, "ipv6");
}
export async function publicTarget(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("ต้องเป็น HTTPS");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address))) throw new Error("ปลายทางไม่ใช่ที่อยู่สาธารณะ");
  return { url, address: addresses[0]! };
}

export interface SafeFetchOptions {
  beforeRequest?: (url: URL) => Promise<void>;
  userAgent?: string;
  allowErrorStatus?: boolean;
}
// Pin the validated DNS result to the socket; no second DNS lookup/rebinding window.
export async function safeFetch(raw: string, signal: AbortSignal, options: SafeFetchOptions = {}): Promise<Response> {
  let current = raw;
  for (let hop = 0; hop < 5; hop++) {
    signal.throwIfAborted();
    const url = new URL(current);
    await options.beforeRequest?.(url);
    const target = await publicTarget(url.toString());
    const res = await new Promise<Response>((resolve, reject) => {
      const req = request(target.url, {
        signal, agent: false,
        lookup: (_host, opts, cb) => opts.all
          ? cb(null, [{ address: target.address.address, family: target.address.family }])
          : cb(null, target.address.address, target.address.family),
        headers: { "user-agent": options.userAgent ?? "AURUM-AutoDownload/1.0", accept: "*/*", "accept-encoding": "identity" },
      }, (incoming) => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
        const status = incoming.statusCode ?? 502;
        const noBody = [204, 205, 304].includes(status);
        if (noBody) incoming.resume();
        const response = new Response(noBody ? null : Readable.toWeb(incoming) as ReadableStream<Uint8Array>, { status, headers });
        Object.defineProperty(response, "url", { value: target.url.toString() });
        resolve(response);
      });
      req.on("error", reject);
      req.setTimeout(30_000, () => req.destroy(new Error("request timeout")));
      req.end();
    });
    if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.get("location")) {
      await res.body?.cancel();
      current = new URL(res.headers.get("location")!, target.url).toString();
      continue;
    }
    if (!options.allowErrorStatus && (!res.ok || !res.body)) { await res.body?.cancel(); throw new Error(`ต้นทางตอบกลับ HTTP ${res.status}`); }
    return res;
  }
  throw new Error("redirect มากเกินไป");
}
