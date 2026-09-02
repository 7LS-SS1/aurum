import { ApiError } from "@/lib/api-response";
import { deleteDoujinR2Object } from "@/lib/storage/doujin-r2";

/**
 * Comic/chapter/image rows store their R2 object key directly (unlike Movie,
 * which derives it by parsing the public URL) — so cleanup here is just a
 * straight delete-by-key, no URL-parsing needed. Uses the Doujin-specific R2
 * client (separate bucket from video) — see src/lib/storage/doujin-r2.ts.
 */
export async function cleanupComicObjectKeys(objectKeys: (string | null | undefined)[]): Promise<void> {
  const keys = [...new Set(objectKeys.filter((key): key is string => Boolean(key)))];
  if (!keys.length) return;

  try {
    await Promise.all(keys.map((key) => deleteDoujinR2Object(key)));
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.error("comic media cleanup failed", { keys, err });
    throw new ApiError("media_cleanup_failed", 502);
  }
}
