import { NextRequest } from "next/server";
import { presignSchema, assertUploadAllowed } from "@/lib/validation";
import { presignR2Upload } from "@/lib/storage/r2";
import { presignBunnyUpload } from "@/lib/storage/bunny";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireRole } from "@/lib/authz";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Issues a short-lived upload credential so the browser can PUT/TUS the file
 * straight to Cloudflare R2 (images) or Bunny Stream (video) — the actual
 * bytes never pass through this server, only the presigned URL does.
 *
 * R2 is used for images/thumbnails only. Video always goes through Bunny
 * Stream, which transcodes to adaptive-bitrate HLS — R2 is plain object
 * storage and can't do that.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole("ADMIN", "EDITOR");

    const { success } = await rateLimit(`uploads:presign:${user.id}`, { limit: 20, windowMs: 60_000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const input = presignSchema.parse(await req.json());

    if (input.provider === "r2") {
      assertUploadAllowed("image", input.contentType, input.size);
      const result = await presignR2Upload({ filename: input.filename, contentType: input.contentType, folder: "images" });
      return jsonOk(result);
    }

    assertUploadAllowed("video", input.contentType, input.size);
    const result = await presignBunnyUpload(input.filename);
    return jsonOk(result);
  } catch (err) {
    return apiError(err);
  }
}
