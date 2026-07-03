import { NextRequest } from "next/server";
import { presignSchema, assertUploadAllowed, assertUploadAllowedAuto } from "@/lib/validation";
import { presignR2Upload } from "@/lib/storage/r2";
import { presignBunnyUpload } from "@/lib/storage/bunny";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Issues a short-lived upload credential so the browser can PUT/TUS the file
 * straight to Cloudflare R2 or Bunny Stream — the actual bytes never pass
 * through this server, only the presigned URL does.
 *
 * R2 holds images/thumbnails/preview clips AND source video (kind inferred
 * from contentType, stored under images/ or videos/) — source video uploaded
 * here is what JWPlayer's fetch-upload ingest later downloads from
 * (see /api/uploads/jwplayer-ingest). Bunny Stream remains available as an
 * optional fallback that transcodes to adaptive-bitrate HLS itself.
 */
export async function POST(req: NextRequest) {
  try {
    const actor = await requireMinRole("STAFF");

    const { success } = await rateLimit(`uploads:presign:${actor.id}`, { limit: 20, windowMs: 60_000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const input = presignSchema.parse(await req.json());

    if (input.provider === "r2") {
      const kind = assertUploadAllowedAuto(input.contentType, input.size);
      const folder = kind === "video" ? "videos" : "images";
      const result = await presignR2Upload({ filename: input.filename, contentType: input.contentType, folder });
      return jsonOk(result);
    }

    assertUploadAllowed("video", input.contentType, input.size);
    const result = await presignBunnyUpload(input.filename);
    return jsonOk(result);
  } catch (err) {
    return apiError(err);
  }
}
