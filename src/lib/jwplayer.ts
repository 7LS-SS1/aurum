import type { PlayerConfig } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { ApiError } from "@/lib/api-response";

type PlayerIdentity = Pick<PlayerConfig, "playerId"> | null | undefined;

export function buildJwPlayerIframeUrl(mediaId?: string | null, player?: PlayerIdentity): string | undefined {
  const cleanMediaId = mediaId?.trim();
  const cleanPlayerId = player?.playerId?.trim();
  if (!cleanMediaId || !cleanPlayerId) return undefined;
  return `https://cdn.jwplayer.com/players/${encodeURIComponent(cleanMediaId)}-${encodeURIComponent(cleanPlayerId)}.html`;
}

export async function getDefaultJwPlayerConfig(): Promise<PlayerIdentity> {
  return prisma.playerConfig.findFirst({
    where: { provider: "JWPLAYER", isActive: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { playerId: true },
  });
}

export interface JwPlayerCredentials {
  playerId: string;
  /** JWX/JWPlayer "site" (property) ID — required to call the V2 Management API. Stored in extraConfig.siteId. */
  siteId?: string;
  /** Decrypted V2 API secret, used as the Bearer token for Management API calls. */
  apiSecret?: string;
}

/**
 * Loads the default active JWPlayer config with the fields needed to call
 * the real Management API (decrypting the secret on the fly) — separate from
 * getDefaultJwPlayerConfig() above, which only ever needed the public playerId
 * for building iframe URLs.
 */
export async function getDefaultJwPlayerCredentials(): Promise<JwPlayerCredentials | null> {
  const config = await prisma.playerConfig.findFirst({
    where: { provider: "JWPLAYER", isActive: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { playerId: true, apiSecretEnc: true, apiSecretIv: true, apiSecretTag: true, extraConfig: true },
  });
  if (!config) return null;

  const extra = (config.extraConfig as Record<string, unknown>) ?? {};
  const siteId = typeof extra.siteId === "string" && extra.siteId.trim() ? extra.siteId.trim() : undefined;
  const apiSecret =
    config.apiSecretEnc && config.apiSecretIv && config.apiSecretTag
      ? decrypt({ ciphertext: config.apiSecretEnc, iv: config.apiSecretIv, tag: config.apiSecretTag })
      : undefined;

  return { playerId: config.playerId, siteId, apiSecret };
}

export type JwIngestStatus = "processing" | "ready" | "unknown";

export interface JwIngestResult {
  mediaId: string;
  status: JwIngestStatus;
}

function mapJwStatus(status: unknown): JwIngestStatus {
  if (typeof status !== "string") return "unknown";
  const s = status.toLowerCase();
  if (s === "ready") return "ready";
  if (["created", "processing", "downloading", "ingesting", "updating"].includes(s)) return "processing";
  return "unknown";
}

/**
 * Ingests a remotely-hosted (R2) source video into JWX/JWPlayer via the V2
 * Management API's "fetch" upload method — JWPlayer's own infrastructure
 * downloads the file from sourceUrl, our server never streams the bytes.
 * https://api.jwplayer.com/v2/sites/{site_id}/media/
 */
export async function createJwPlayerMediaFromUrl(opts: {
  siteId: string;
  apiSecret: string;
  sourceUrl: string;
  title?: string;
}): Promise<JwIngestResult> {
  const res = await fetch(`https://api.jwplayer.com/v2/sites/${encodeURIComponent(opts.siteId)}/media/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      upload: { method: "fetch", download_url: opts.sourceUrl },
      metadata: { title: opts.title?.trim() || "Untitled" },
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    throw new ApiError(`JWPlayer ingest failed: HTTP ${res.status}`, 502);
  }

  const body = (await res.json()) as { id?: string; media_id?: string; key?: string; status?: unknown };
  const mediaId = body.id ?? body.media_id ?? body.key;
  if (!mediaId) {
    throw new ApiError("JWPlayer ingest response did not include a media id", 502);
  }

  return { mediaId, status: mapJwStatus(body.status) };
}
