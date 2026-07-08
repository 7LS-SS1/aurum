import { env } from "@/lib/env";
import { ApiError } from "@/lib/api-response";

export interface ReferrerSyncResult {
  added: string[];
  alreadyPresent: string[];
  failed: { hostname: string; error: string }[];
}

/** Extracts a lowercased hostname from a site's baseUrl, e.g. "https://doomhee.com/path" → "doomhee.com". */
export function extractHostname(baseUrl: string): string | null {
  try {
    return new URL(baseUrl).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * A "root domain" here means exactly two labels (doomhee.com, not
 * www.doomhee.com or a subdomain) — Bunny checks the Referer header's
 * hostname literally, so the bare domain and its www variant must both be
 * allowed for a WordPress site reachable either way.
 */
function withWwwVariant(hostname: string): string[] {
  if (hostname.startsWith("www.")) return [hostname];
  const labelCount = hostname.split(".").length;
  return labelCount === 2 ? [hostname, `www.${hostname}`] : [hostname];
}

/** Builds the deduplicated set of hostnames that should be allowed as Bunny referrers. */
export function buildReferrerDomains(baseUrls: string[]): string[] {
  const { AURUM_PUBLIC_HOSTNAME } = env();
  const domains = new Set<string>();
  domains.add((AURUM_PUBLIC_HOSTNAME ?? "aurum.187.77.152.240.sslip.io").toLowerCase());

  for (const baseUrl of baseUrls) {
    const hostname = extractHostname(baseUrl);
    if (!hostname) continue;
    for (const variant of withWwwVariant(hostname)) domains.add(variant);
  }

  return [...domains];
}

interface BunnyVideoLibrary {
  AllowedReferrers?: string[] | null;
}

const BUNNY_API_BASE = "https://api.bunny.net";

function requireBunnyConfig() {
  const { BUNNY_LIBRARY_ID, BUNNY_ACCOUNT_API_KEY } = env();
  if (!BUNNY_LIBRARY_ID || !BUNNY_ACCOUNT_API_KEY) {
    throw new ApiError("Bunny referrer sync is not configured (BUNNY_LIBRARY_ID / BUNNY_ACCOUNT_API_KEY)", 503);
  }
  return { libraryId: BUNNY_LIBRARY_ID, accountApiKey: BUNNY_ACCOUNT_API_KEY };
}

async function fetchCurrentReferrers(libraryId: string, accountApiKey: string): Promise<string[]> {
  const res = await fetch(`${BUNNY_API_BASE}/videolibrary/${libraryId}`, {
    headers: { AccessKey: accountApiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new ApiError(`Failed to read current Bunny video library settings: HTTP ${res.status}`, 502);
  }
  const data = (await res.json()) as BunnyVideoLibrary;
  return (data.AllowedReferrers ?? []).map((h) => h.toLowerCase());
}

async function addReferrer(libraryId: string, accountApiKey: string, hostname: string): Promise<void> {
  const res = await fetch(`${BUNNY_API_BASE}/videolibrary/${libraryId}/addAllowedReferrer`, {
    method: "POST",
    headers: { AccessKey: accountApiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ Hostname: hostname }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { Message?: string };
      if (body.Message) message = body.Message;
    } catch {
      // Bunny didn't return a JSON body — keep the status-only message.
    }
    throw new Error(message);
  }
}

/**
 * Reads all active TargetSite hostnames + AURUM's own domain, then adds
 * whichever ones Bunny doesn't already allow as a video Referer. Never
 * removes existing entries — this is additive-only so it can't lock out a
 * domain someone added manually in the Bunny dashboard.
 */
export async function syncBunnyReferrers(baseUrls: string[]): Promise<ReferrerSyncResult> {
  const { libraryId, accountApiKey } = requireBunnyConfig();

  const wanted = buildReferrerDomains(baseUrls);
  const current = new Set(await fetchCurrentReferrers(libraryId, accountApiKey));

  const result: ReferrerSyncResult = { added: [], alreadyPresent: [], failed: [] };

  for (const hostname of wanted) {
    if (current.has(hostname)) {
      result.alreadyPresent.push(hostname);
      continue;
    }
    try {
      await addReferrer(libraryId, accountApiKey, hostname);
      result.added.push(hostname);
    } catch (err) {
      result.failed.push({ hostname, error: err instanceof Error ? err.message : "unknown_error" });
    }
  }

  return result;
}
