import { ApiError } from "@/lib/api-response";
import { deleteBunnyVideo, getBunnyVideoIdFromUrl } from "@/lib/storage/bunny";
import { deleteR2Object, getR2ObjectKeyFromPublicUrl } from "@/lib/storage/r2";

export interface MovieMediaRefs {
  id: string;
  thumbnailUrl: string | null;
  previewUrl: string | null;
  videoUrl: string | null;
}

export interface MediaCleanupResult {
  r2Keys: string[];
  bunnyVideoIds: string[];
  skippedUrls: string[];
}

export async function cleanupMovieMedia(movie: MovieMediaRefs): Promise<MediaCleanupResult> {
  const urls = [movie.thumbnailUrl, movie.previewUrl, movie.videoUrl].filter((url): url is string => Boolean(url));
  const r2Keys = new Set<string>();
  const bunnyVideoIds = new Set<string>();
  const skippedUrls: string[] = [];

  for (const url of urls) {
    const r2Key = getR2ObjectKeyFromPublicUrl(url);
    if (r2Key) {
      r2Keys.add(r2Key);
      continue;
    }

    const bunnyVideoId = getBunnyVideoIdFromUrl(url);
    if (bunnyVideoId) {
      bunnyVideoIds.add(bunnyVideoId);
      continue;
    }

    skippedUrls.push(url);
  }

  try {
    await Promise.all([...r2Keys].map((key) => deleteR2Object(key)));
    await Promise.all([...bunnyVideoIds].map((videoId) => deleteBunnyVideo(videoId)));
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.error("media cleanup failed", { movieId: movie.id, err });
    throw new ApiError("media_cleanup_failed", 502);
  }

  return {
    r2Keys: [...r2Keys],
    bunnyVideoIds: [...bunnyVideoIds],
    skippedUrls,
  };
}
