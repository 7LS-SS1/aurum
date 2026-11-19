import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ApiError } from "@/lib/api-response";
import { SLUG_PATTERN } from "@/lib/slug";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const names = z.array(z.string().trim().min(1).max(120)).max(50)
  .transform((items) => [...new Set(items)].sort());
const mediaUrl = z.string().trim().url().max(2048).refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password && !url.hash;
}, "Use a permanent HTTPS URL without credentials or fragment");

export const videoIngestSchema = z.object({
  source: z.string().trim().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  externalId: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(500),
  slug: z.string().trim().min(1).max(500).regex(SLUG_PATTERN),
  content: z.string().trim().min(1).max(20_000),
  mainCategory: z.string().trim().min(1).max(120),
  categories: names.default([]),
  tags: names.default([]),
  videoUrl: mediaUrl,
  thumbnailUrl: mediaUrl,
  videoProvider: z.enum(["external", "bunny", "s3", "r2"]).default("external"),
}).strict();

export function requireVideoIngestKey(req: Request) {
  const key = process.env.VIDEO_INGEST_API_KEY;
  if (!key || key.length < 32) throw new ApiError("video_ingest_not_configured", 503);
  const provided = req.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!provided || !timingSafeEqual(Buffer.from(hash(provided)), Buffer.from(hash(key)))) {
    throw new ApiError("unauthorized", 401);
  }
}

export function ingestIdentity(input: z.infer<typeof videoIngestSchema>) {
  return {
    id: `ingest_${hash(JSON.stringify([input.source, input.externalId]))}`,
    payloadHash: hash(JSON.stringify(input)),
  };
}

export async function readIngestBody(req: Request) {
  if (req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    throw new ApiError("json_required", 415);
  }
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError("invalid_json", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 256 * 1024) {
        await reader.cancel();
        throw new ApiError("payload_too_large", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new ApiError("invalid_json", 400); }
}
