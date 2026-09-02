import { NextRequest } from "next/server";
import { presignSchema, assertUploadAllowed } from "@/lib/validation";
import { presignDoujinR2Upload, getDoujinR2ObjectKeyFromPublicUrl } from "@/lib/storage/doujin-r2";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Single-file presign for a comic cover image — the Doujin-specific
 * counterpart to /api/uploads/presign (video). Deliberately separate so a
 * cover upload never touches the video R2 bucket; see
 * src/lib/storage/doujin-r2.ts. Reuses presignSchema's shape (provider is
 * ignored here — Doujin covers are always R2/images).
 */
export async function POST(req: NextRequest) {
  try {
    const actor = await requireMinRole("STAFF");

    const { success } = await rateLimit(`comic-uploads:presign:${actor.id}`, { limit: 20, windowMs: 60_000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const input = presignSchema.parse(await req.json());
    assertUploadAllowed("image", input.contentType, input.size);

    const result = await presignDoujinR2Upload({ filename: input.filename, contentType: input.contentType, folder: "covers" });
    const objectKey = getDoujinR2ObjectKeyFromPublicUrl(result.publicUrl);
    if (!objectKey) throw new ApiError("internal_server_error", 500);
    return jsonOk({ ...result, objectKey });
  } catch (err) {
    return apiError(err);
  }
}
