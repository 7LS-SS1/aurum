import { ApiError } from "./api-response";

export function servicePageOriginAllowed(origin: string | null, requestUrl: string, configuredUrl = process.env.AUTH_URL): boolean {
  if (!origin) return false;
  try {
    // Trust operator configuration, never client-controlled forwarded headers.
    const expected = new URL(configuredUrl || requestUrl);
    if (!["http:", "https:"].includes(expected.protocol) || expected.username || expected.password) return false;
    if (origin === expected.origin) return true;
    // The public app and management host share the same API deployment. Only
    // explicitly configured HTTPS origins qualify during the host cutover.
    if (process.env.MANAGEMENT_HOST_ENABLED !== "true") return false;
    return [process.env.MANAGEMENT_APP_ORIGIN, process.env.PUBLIC_APP_ORIGIN].some(value => {
      if (!value) return false;
      try {
        const allowed = new URL(value);
        return allowed.protocol === "https:" && !allowed.username && !allowed.password &&
          allowed.pathname === "/" && !allowed.search && !allowed.hash && origin === allowed.origin;
      } catch { return false; }
    });
  } catch { return false; }
}

export async function readServicePageBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError("invalid_json", 400);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 250_000) { await reader.cancel(); throw new ApiError("payload_too_large", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new ApiError("invalid_json", 400); }
}
