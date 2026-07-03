import { NextRequest } from "next/server";
import { jwPlayerIngestSchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { getDefaultJwPlayerCredentials, createJwPlayerMediaFromUrl, buildJwPlayerIframeUrl } from "@/lib/jwplayer";

function hostnameOf(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

/**
 * Second step of the automated JWPlayer ingest flow: the browser has already
 * uploaded the source file straight to R2 (see /api/uploads/presign); this
 * route tells JWPlayer's V2 Management API to fetch that R2 URL into JWX,
 * and returns the resulting Media ID + iframe embed URL. The video bytes
 * never pass through this server — only the small JSON ingest request does.
 */
export async function POST(req: NextRequest) {
  try {
    const actor = await requireMinRole("STAFF");

    const { success } = await rateLimit(`uploads:jwplayer-ingest:${actor.id}`, { limit: 10, windowMs: 60_000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const input = jwPlayerIngestSchema.parse(await req.json());

    let sourceHost: string;
    try {
      sourceHost = new URL(input.sourceUrl).hostname;
    } catch {
      throw new ApiError("invalid sourceUrl", 400);
    }
    const allowedHosts = new Set([hostnameOf(env().R2_PUBLIC_HOSTNAME), hostnameOf(env().BUNNY_CDN_HOST)].filter((h): h is string => Boolean(h)));
    if (allowedHosts.size > 0 && !allowedHosts.has(sourceHost)) {
      throw new ApiError("sourceUrl must point to a configured R2/Bunny host", 400);
    }

    const creds = await getDefaultJwPlayerCredentials();
    if (!creds) throw new ApiError("jwplayer_not_configured", 503);
    if (!creds.apiSecret) throw new ApiError("jwplayer_api_secret_missing: set API Secret in Admin -> Player", 503);
    if (!creds.siteId) throw new ApiError("jwplayer_site_id_missing: set Site/Property ID in Admin -> Player", 503);

    const ingest = await createJwPlayerMediaFromUrl({
      siteId: creds.siteId,
      apiSecret: creds.apiSecret,
      sourceUrl: input.sourceUrl,
      title: input.title ?? input.filename,
    });

    const iframeUrl = buildJwPlayerIframeUrl(ingest.mediaId, { playerId: creds.playerId });

    await logAudit({
      actor,
      action: "jwplayer_ingest",
      resourceType: "jwplayer_media",
      resourceId: ingest.mediaId,
      metadata: { status: ingest.status, sourceUrl: input.sourceUrl },
    });

    return jsonOk({
      jwPlayerMediaId: ingest.mediaId,
      iframeUrl,
      sourceUrl: input.sourceUrl,
      status: ingest.status,
    });
  } catch (err) {
    return apiError(err);
  }
}
