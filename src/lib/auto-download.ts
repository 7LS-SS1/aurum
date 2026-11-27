import { safeFetch } from "@/lib/safe-http";
export { isPublicAddress } from "@/lib/safe-http";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { r2PublicUrl } from "@/lib/storage/r2";
import { slugifyTitle } from "@/lib/slug";
import { streamToR2 } from "@/lib/storage/stream-to-r2";
import { downloadFetcher, mediaType, resolveDownload } from "@/lib/download-source";
import { ingestMedia, readVodPlaylist } from "@/lib/source-scanner/media";
import { redactedUrl, ScannerError } from "@/lib/source-scanner/contracts";

/**
 * Automatic download: staff (or the ingest API) queue a remote media URL, the
 * worker copies the file into R2 and creates the Movie straight in
 * READY_FOR_REVIEW ("รอตรวจสอบ"). There is no approval step before the
 * download; the review list is where people check the result afterwards.
 */

export const AUTO_DOWNLOAD_STATUS_LABEL = {
  QUEUED: "รอคิว",
  DOWNLOADING: "กำลังดาวน์โหลด",
  DONE: "เสร็จแล้ว",
  FAILED: "ล้มเหลว",
} as const;

const MAX_ATTEMPTS = 3;
const STALE_MS = 30 * 60_000;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const NON_RETRYABLE = new Set(["INVALID_URL", "PRIVATE_ADDRESS", "AMBIGUOUS_MEDIA", "INVALID_MEDIA", "TOO_LARGE", "UNSUPPORTED_PLAYER", "RATE_LIMITED"]);
const httpsUrl = z.string().trim().url().max(2048).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port;
  } catch { return false; }
}, "ต้องเป็น URL แบบ HTTPS ที่ไม่มีชื่อผู้ใช้/รหัสผ่าน");
const names = z.array(z.string().trim().min(1).max(120)).max(50).default([])
  .transform((items) => [...new Set(items)]);

export const enqueueSchema = z.object({
  mainCategory: z.string().trim().min(1).max(120),
  categories: names,
  tags: names,
  items: z.array(z.object({
    sourceUrl: httpsUrl,
    thumbnailUrl: z.literal("").transform(() => undefined).or(httpsUrl.optional()),
    title: z.string().trim().max(500).optional(),
  })).min(1).max(100),
}).strict();
export const checkDownloadSchema = z.object({ urls: z.array(z.string().trim().min(1).max(2048)).min(1).max(5) }).strict();

export function maxDownloadBytes() {
  const configured = Number(process.env.AUTO_DOWNLOAD_MAX_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : 4 * 1024 ** 3;
}

function titleFromUrl(url: string) {
  const filename = new URL(url).pathname.split("/").filter(Boolean).pop() || "";
  let decoded = filename;
  try { decoded = decodeURIComponent(filename); } catch { /* Keep the literal path when percent encoding is invalid. */ }
  return decoded.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[-_.]+/g, " ").trim().slice(0, 500) || "วิดีโอใหม่";
}

export async function checkDownload(url: string, signal: AbortSignal) {
  const fetcher = downloadFetcher(signal);
  const media = await resolveDownload(url, fetcher, maxDownloadBytes());
  if (media.format === "hls") await readVodPlaylist(media.response, media.mediaUrl, fetcher);
  else await media.stream.cancel().catch(() => undefined);
  return { kind: media.webpage ? "page" : "file", format: media.format === "hls" ? "HLS VOD" : media.ext.toUpperCase(),
    title: media.title, mediaUrl: redactedUrl(media.mediaUrl), bytes: media.bytes };
}

export async function enqueueDownloads(input: z.infer<typeof enqueueSchema>, createdById: string | null) {
  const created = await prisma.$transaction(input.items.map((item) => prisma.autoDownloadJob.create({
    data: {
      sourceUrl: item.sourceUrl,
      thumbnailUrl: item.thumbnailUrl ?? null,
      title: item.title || titleFromUrl(item.sourceUrl),
      mainCategory: input.mainCategory,
      categories: input.categories,
      tags: input.tags,
      createdById,
    },
    select: { id: true },
  })));
  return created.map((job) => job.id);
}

async function downloadVideo(jobId: string, sourceUrl: string, coverUrl: string | null, signal: AbortSignal) {
  const fetcher = downloadFetcher(signal);
  const maxBytes = maxDownloadBytes();
  const media = await resolveDownload(sourceUrl, fetcher, maxBytes);
  if (media.format === "hls") {
    const saved = await ingestMedia({ sourceId: "auto", itemId: jobId, mediaUrl: media.mediaUrl, coverUrl, maxBytes, fetcher, signal,
      initialResponse: media.response, storage: "auto", progress: async () => undefined });
    return { url: saved.videoUrl, bytes: saved.bytes, title: media.title, thumbnailUrl: saved.thumbnailUrl };
  }
  const key = `videos/auto/${jobId}.${media.ext}`;
  const bytes = await streamToR2(media.stream, key, media.contentType, maxBytes, signal);
  return { url: r2PublicUrl(key), bytes, title: media.title, thumbnailUrl: null };
}

async function downloadThumbnail(jobId: string, sourceUrl: string, signal: AbortSignal) {
  const res = await safeFetch(sourceUrl, signal);
  const type = mediaType(res);
  if (!type.startsWith("image/")) { await res.body!.cancel(); throw new Error("ภาพปกไม่ใช่ไฟล์รูปภาพ"); }
  const ext = type.split("/")[1]?.replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "") || "jpg";
  const key = `images/auto/${jobId}.${ext}`;
  await streamToR2(res.body!, key, type, MAX_IMAGE_BYTES, signal);
  return r2PublicUrl(key);
}

async function claimNext(ids?: string[]) {
  const candidate = await prisma.autoDownloadJob.findFirst({
    where: { id: ids ? { in: ids } : undefined, OR: [{ status: "QUEUED" }, { status: "DOWNLOADING", startedAt: { lt: new Date(Date.now() - STALE_MS) } }] },
    orderBy: { createdAt: "asc" },
  });
  if (!candidate) return null;
  const claimed = await prisma.autoDownloadJob.updateMany({
    where: { id: candidate.id, status: candidate.status, updatedAt: candidate.updatedAt },
    data: { status: "DOWNLOADING", startedAt: new Date(), attempts: { increment: 1 }, error: null },
  });
  return claimed.count ? { ...candidate, attempts: candidate.attempts + 1 } : null;
}

async function uniqueSlug(title: string, id: string) {
  const base = slugifyTitle(title, "video");
  const taken = await prisma.movie.findUnique({ where: { slug: base }, select: { id: true } });
  return taken ? `${base}-${id.slice(-6)}` : base;
}

/** Processes one queued job. Returns null when the queue is empty. */
export async function processNextDownload(ids?: string[]) {
  const job = await claimNext(ids);
  if (!job) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 270_000);
  try {
    const video = await downloadVideo(job.id, job.sourceUrl, job.thumbnailUrl, controller.signal);
    const thumbnailUrl = video.thumbnailUrl ?? (job.thumbnailUrl
      ? await downloadThumbnail(job.id, job.thumbnailUrl, controller.signal).catch(() => job.thumbnailUrl)
      : null);
    const title = job.title === titleFromUrl(job.sourceUrl) && video.title ? video.title : job.title;
    const movieId = `auto_${job.id}`;
    const slug = await uniqueSlug(title, job.id);
    await prisma.$transaction(async (tx) => {
      const sites = await tx.targetSite.findMany({ where: { isActive: true }, select: { id: true, mainCategories: true } });
      const targetSiteIds = sites.filter((site) => {
        const accepted = Array.isArray(site.mainCategories) ? site.mainCategories : [];
        return accepted.length === 0 || accepted.includes(job.mainCategory);
      }).map((site) => site.id);
      const tags = (Array.isArray(job.tags) ? job.tags : []).map(String);
      await tx.movie.upsert({
        where: { id: movieId },
        update: {},
        create: {
          id: movieId, title, slug, mainCategory: job.mainCategory, categories: job.categories ?? [],
          videoUrl: video.url, videoProvider: "r2", thumbnailUrl, status: "READY_FOR_REVIEW", targetSiteIds,
          createdById: job.createdById,
          tags: { connectOrCreate: tags.map((name) => ({ where: { name }, create: { name } })) },
          extraMeta: { autoDownload: { jobId: job.id, sourceUrl: job.sourceUrl, bytes: video.bytes } },
        },
      });
      await tx.autoDownloadJob.update({ where: { id: job.id }, data: { title, status: "DONE", movieId, bytes: BigInt(video.bytes), finishedAt: new Date() } });
      await tx.auditLog.create({ data: { actorRole: "SYSTEM", action: "auto_download_movie", resourceType: "movie", resourceId: movieId, metadata: { jobId: job.id } } });
    });
    return { id: job.id, status: "DONE" as const, movieId };
  } catch (error) {
    const message = controller.signal.aborted ? "หมดเวลาดาวน์โหลด" : error instanceof Error ? error.message.slice(0, 500) : "ดาวน์โหลดไม่สำเร็จ";
    const retry = job.attempts < MAX_ATTEMPTS && !(error instanceof ScannerError && NON_RETRYABLE.has(error.code));
    await prisma.autoDownloadJob.update({ where: { id: job.id }, data: { status: retry ? "QUEUED" : "FAILED", error: message, finishedAt: retry ? null : new Date() } });
    return { id: job.id, status: retry ? "QUEUED" as const : "FAILED" as const, error: message };
  } finally {
    clearTimeout(timer);
  }
}

/** Runs jobs until the queue is empty or the time budget is spent. */
export async function drainDownloads(budgetMs = 240_000, ids?: string[]) {
  const started = Date.now();
  const results = [];
  while (Date.now() - started < budgetMs) {
    const result = await processNextDownload(ids);
    if (!result) break;
    results.push(result);
  }
  return { processed: results.length, results };
}
