import { NextRequest } from "next/server";
import { presignBatchSchema, assertUploadAllowed } from "@/lib/validation";
import { presignDoujinR2Upload, getDoujinR2ObjectKeyFromPublicUrl } from "@/lib/storage/doujin-r2";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Batch variant for chapter page uploads — a doujin/manga chapter can have
 * 20-40 page images, so issuing one presigned URL per request (and burning
 * one rate-limit slot each time) would blow through a per-file rate limit.
 * This does one rateLimit check for the whole batch instead. Images only.
 * Uses the Doujin-specific R2 client (separate bucket from video) — see
 * src/lib/storage/doujin-r2.ts.
 */
export async function POST(req: NextRequest) {
  try {
    const actor = await requireMinRole("STAFF");

    const { success } = await rateLimit(`comic-uploads:presign-batch:${actor.id}`, { limit: 10, windowMs: 60_000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const items = presignBatchSchema.parse(await req.json());
    for (const item of items) assertUploadAllowed("image", item.contentType, item.size);

    const results = await Promise.all(
      items.map(async (item) => {
        const presigned = await presignDoujinR2Upload({ filename: item.filename, contentType: item.contentType, folder: "pages" });
        const objectKey = getDoujinR2ObjectKeyFromPublicUrl(presigned.publicUrl);
        if (!objectKey) throw new ApiError("internal_server_error", 500);
        return { ...presigned, objectKey };
      }),
    );

    return jsonOk(results);
  } catch (err) {
    return apiError(err);
  }
}
