import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/api-response";

export interface PresignedTusUpload {
  strategy: "tus";
  uploadUrl: string;
  tus: {
    AuthorizationSignature: string;
    AuthorizationExpire: string;
    LibraryId: string;
    VideoId: string;
  };
  publicUrl: string;
}

/**
 * Bunny.net Stream: server creates the video object with the secret API key,
 * then hands the browser a short-lived TUS signature so the (potentially
 * multi-GB) upload goes straight from the browser to Bunny — never through
 * our own server.
 */
export async function presignBunnyUpload(filename: string): Promise<PresignedTusUpload> {
  const { BUNNY_LIBRARY_ID, BUNNY_API_KEY, BUNNY_CDN_HOST } = env();
  if (!BUNNY_LIBRARY_ID || !BUNNY_API_KEY || !BUNNY_CDN_HOST) {
    throw new ApiError("Bunny Stream is not configured (BUNNY_LIBRARY_ID / BUNNY_API_KEY / BUNNY_CDN_HOST)", 503);
  }

  const createRes = await fetch(`https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos`, {
    method: "POST",
    headers: { AccessKey: BUNNY_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ title: filename }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!createRes.ok) {
    throw new ApiError(`Failed to create Bunny video object: HTTP ${createRes.status}`, 502);
  }
  const created = (await createRes.json()) as { guid: string };
  const videoId = created.guid;

  const expire = Math.floor(Date.now() / 1000) + 3600;
  const signature = createHash("sha256").update(BUNNY_LIBRARY_ID + BUNNY_API_KEY + expire + videoId).digest("hex");

  return {
    strategy: "tus",
    uploadUrl: "https://video.bunnycdn.com/tusupload",
    tus: {
      AuthorizationSignature: signature,
      AuthorizationExpire: String(expire),
      LibraryId: String(BUNNY_LIBRARY_ID),
      VideoId: videoId,
    },
    publicUrl: `https://${BUNNY_CDN_HOST}/${videoId}/playlist.m3u8`,
  };
}

export function getBunnyVideoIdFromUrl(fileUrl: string): string | null {
  const { BUNNY_CDN_HOST } = env();
  if (!BUNNY_CDN_HOST) return null;

  let parsed: URL;
  try {
    parsed = new URL(fileUrl);
  } catch {
    return null;
  }

  if (parsed.hostname !== BUNNY_CDN_HOST) return null;
  const [videoId] = parsed.pathname.replace(/^\/+/, "").split("/");
  return videoId || null;
}

export async function deleteBunnyVideo(videoId: string): Promise<void> {
  const { BUNNY_LIBRARY_ID, BUNNY_API_KEY } = env();
  if (!BUNNY_LIBRARY_ID || !BUNNY_API_KEY) {
    throw new ApiError("Bunny Stream is not configured (BUNNY_LIBRARY_ID / BUNNY_API_KEY)", 503);
  }

  const res = await fetch(`https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos/${videoId}`, {
    method: "DELETE",
    headers: { AccessKey: BUNNY_API_KEY },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok && res.status !== 404) {
    throw new ApiError(`Failed to delete Bunny video: HTTP ${res.status}`, 502);
  }
}
