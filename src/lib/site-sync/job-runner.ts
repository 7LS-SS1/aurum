import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { WordPressClient, WordPressScanError } from "@/lib/wordpress-client";
import { distributeToSite } from "@/lib/distributor";
import { buildWpMatchIndex, findMatch, type MovieForMatch } from "./match";
import { ELIGIBLE_SYNC_STATUSES } from "./job-service";

/** How long a claim lease lasts before another worker tick may steal a stuck job — bounds crash recovery time. */
const LEASE_MS = 120_000;
/** Bounded work per HTTP request — never process every active job in one call. */
const MAX_JOBS_PER_TICK = 5;
/** Per-tick push batch — keeps each worker invocation short and limits WordPress request concurrency. */
const PUSH_BATCH_SIZE = 6;
const PUSH_CONCURRENCY = 3;

const SCAN_STATUSES = ["publish", "future", "draft", "pending", "private"];
const SCAN_MAX_PAGES = 500;
const SCAN_BUDGET_MS = 90_000;

type JobWithSite = Prisma.SiteSyncJobGetPayload<{ include: { site: true } }>;

interface PushCursor {
  pushQueue?: string[];
}

function truncateMessage(message: string, max = 1000): string {
  return message.length <= max ? message : `${message.slice(0, max - 3).trimEnd()}...`;
}

async function writeLog(
  jobId: string,
  level: "INFO" | "WARN" | "ERROR",
  event: string,
  message: string,
  extra: { movieId?: string; remotePostId?: string; remotePostUrl?: string; metadata?: Record<string, unknown> } = {},
): Promise<void> {
  await prisma.siteSyncJobLog.create({
    data: {
      jobId,
      level,
      event,
      message: truncateMessage(message),
      movieId: extra.movieId,
      remotePostId: extra.remotePostId,
      remotePostUrl: extra.remotePostUrl,
      metadata: (extra.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

/**
 * Atomically claims up to MAX_JOBS_PER_TICK stale-or-unclaimed active jobs
 * and runs one bounded step of each. Safe to call concurrently from multiple
 * worker/cron invocations — the claim below is a conditional UPDATE guarded
 * by `lockedUntil`, which Postgres serializes per-row, so two processes
 * racing for the same job id can never both win it (the same guarantee
 * `SELECT ... FOR UPDATE SKIP LOCKED` gives, just expressed as a compare-and-
 * set on a single row instead of a locked row scan).
 */
export async function runWorkerTick(workerId: string): Promise<{ claimed: number; jobIds: string[] }> {
  const now = new Date();
  const candidates = await prisma.siteSyncJob.findMany({
    where: {
      status: { in: ["QUEUED", "SCANNING", "PROCESSING"] },
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    },
    orderBy: { createdAt: "asc" },
    take: MAX_JOBS_PER_TICK,
    select: { id: true },
  });

  const settled = await Promise.allSettled(candidates.map((c) => claimAndProcessJob(c.id, workerId)));
  const claimedIds = candidates
    .map((c, i) => ({ id: c.id, ok: settled[i]?.status === "fulfilled" && (settled[i] as PromiseFulfilledResult<boolean>).value }))
    .filter((r) => r.ok)
    .map((r) => r.id);

  return { claimed: claimedIds.length, jobIds: claimedIds };
}

async function claimAndProcessJob(jobId: string, workerId: string): Promise<boolean> {
  const now = new Date();
  const claim = await prisma.siteSyncJob.updateMany({
    where: {
      id: jobId,
      status: { in: ["QUEUED", "SCANNING", "PROCESSING"] },
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    },
    data: { lockedUntil: new Date(now.getTime() + LEASE_MS), lockedBy: workerId, heartbeatAt: now },
  });
  if (claim.count !== 1) return false;

  const job = await prisma.siteSyncJob.findUnique({ where: { id: jobId }, include: { site: true } });
  if (!job) return false;

  try {
    if (job.phase === "pushing") {
      await runPushBatch(job);
    } else {
      await runScanAndCompare(job);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown site-sync error";
    await finalizeJob(jobId, "FAILED", message);
    await writeLog(jobId, "ERROR", "job_failed", message);
    return true;
  }

  // Release the lease immediately if the job is still in-flight so the very
  // next cron tick can continue it without waiting out the full lease —
  // the lease's only job is bounding recovery time after a crash mid-tick.
  await prisma.siteSyncJob.updateMany({
    where: { id: jobId, status: { in: ["QUEUED", "SCANNING", "PROCESSING"] } },
    data: { lockedUntil: null },
  });

  return true;
}

async function finalizeJob(jobId: string, status: "COMPLETED" | "PARTIAL" | "FAILED" | "CANCELLED", errorMessage?: string) {
  await prisma.siteSyncJob.update({
    where: { id: jobId },
    data: {
      status,
      phase: status.toLowerCase(),
      progress: status === "FAILED" || status === "CANCELLED" ? undefined : 100,
      errorMessage: errorMessage ? truncateMessage(errorMessage) : null,
      finishedAt: new Date(),
      activeSiteId: null,
      lockedUntil: null,
    },
  });
}

/**
 * Scans every WordPress post on the destination site, then compares every
 * eligible AURUM movie against that scan. Done as one un-chunked step
 * because both halves are bounded and fast relative to the per-movie
 * WordPress writes in runPushBatch() — see WordPressClient.listAllPosts()
 * for the scan's own page-count/time budget, which is what actually keeps
 * this bounded. A scan failure here must never fall through to pushing —
 * that would blind-publish every movie and create duplicates.
 */
export async function runScanAndCompare(job: JobWithSite): Promise<void> {
  await prisma.siteSyncJob.update({
    where: { id: job.id },
    data: { status: "SCANNING", phase: "scanning", startedAt: job.startedAt ?? new Date(), progress: Math.max(job.progress, 5) },
  });
  await writeLog(job.id, "INFO", "scan_started", `เริ่มตรวจสอบโพสต์บน ${job.site.name}`);

  const credential = decrypt({ ciphertext: job.site.credentialEnc, iv: job.site.credentialIv, tag: job.site.credentialTag });
  const client = new WordPressClient({
    baseUrl: job.site.baseUrl,
    authType: job.site.authType,
    username: job.site.wpUsername,
    credential,
    postType: job.site.postType,
    categoryRestBase: job.site.categoryRestBase,
    tagRestBase: job.site.tagRestBase,
  });

  let posts;
  try {
    posts = await client.listAllPosts(SCAN_STATUSES, { maxPages: SCAN_MAX_PAGES, budgetMs: SCAN_BUDGET_MS });
  } catch (err) {
    // Never blind-publish off an unreliable/incomplete scan — fail the job instead.
    const message = err instanceof WordPressScanError || err instanceof Error ? err.message : "WordPress scan failed";
    throw new Error(`scan_failed: ${message}`);
  }

  await prisma.siteSyncJob.update({ where: { id: job.id }, data: { phase: "comparing", progress: 20 } });
  await writeLog(job.id, "INFO", "scan_completed", `พบโพสต์บนเว็บไซต์ทั้งหมด ${posts.length} รายการ กำลังเปรียบเทียบวิดีโอ`, {
    metadata: { postsScanned: posts.length },
  });

  const index = buildWpMatchIndex(posts);
  const eligibleMovies = await prisma.movie.findMany({
    where: { status: { in: ELIGIBLE_SYNC_STATUSES } },
    select: { id: true, slug: true, title: true, videoUrl: true, jwPlayerMediaId: true },
  });
  const existingDistributions = await prisma.distribution.findMany({
    where: { siteId: job.siteId, movieId: { in: eligibleMovies.map((m) => m.id) } },
  });
  const distByMovieId = new Map(existingDistributions.map((d) => [d.movieId, d]));

  let matchedMovies = 0;
  let skippedMovies = 0;
  const pushQueue: string[] = [];

  for (const movie of eligibleMovies) {
    const candidate: MovieForMatch = movie;
    const match = findMatch(candidate, index);

    if (match) {
      matchedMovies += 1;
      skippedMovies += 1;
      await prisma.distribution.upsert({
        where: { movieId_siteId: { movieId: movie.id, siteId: job.siteId } },
        update: { status: "SUCCESS", remotePostId: String(match.entry.id), remotePostUrl: match.entry.link, errorMessage: null, distributedAt: new Date() },
        create: { movieId: movie.id, siteId: job.siteId, status: "SUCCESS", remotePostId: String(match.entry.id), remotePostUrl: match.entry.link, distributedAt: new Date(), attempts: 1 },
      });
      await writeLog(job.id, "INFO", "reconciled", `พบโพสต์เดิมบนเว็บไซต์ — ข้าม (${match.strategy})`, {
        movieId: movie.id,
        remotePostId: String(match.entry.id),
        remotePostUrl: match.entry.link,
        metadata: { strategy: match.strategy, title: movie.title },
      });

      // Best-effort: stamp aurum_movie_id onto legacy posts matched by a
      // weaker strategy so the next sync hits the fast path. Never allowed
      // to fail the reconciliation itself.
      if (match.strategy !== "aurum_movie_id") {
        client.updatePostMeta(match.entry.id, { aurum_movie_id: movie.id }).catch(() => {});
      }
      continue;
    }

    const existingDist = distByMovieId.get(movie.id);
    if (existingDist?.status === "SUCCESS" && existingDist.remotePostId) {
      skippedMovies += 1;
      await writeLog(
        job.id,
        "WARN",
        "local_success_no_remote_match",
        "AURUM บันทึกว่าเผยแพร่แล้วแต่ไม่พบโพสต์บนเว็บไซต์จริง — ข้ามเพื่อป้องกันการสร้างซ้ำ กรุณาตรวจสอบด้วยตนเอง",
        { movieId: movie.id, metadata: { title: movie.title, previousRemotePostId: existingDist.remotePostId } },
      );
      continue;
    }

    pushQueue.push(movie.id);
  }

  const totalMovies = eligibleMovies.length;
  const queuedMovies = pushQueue.length;

  if (queuedMovies === 0) {
    await prisma.siteSyncJob.update({
      where: { id: job.id },
      data: {
        totalMovies,
        scannedMovies: totalMovies,
        matchedMovies,
        skippedMovies,
        queuedMovies: 0,
        status: "COMPLETED",
        phase: "completed",
        progress: 100,
        finishedAt: new Date(),
        activeSiteId: null,
        lockedUntil: null,
      },
    });
    await writeLog(job.id, "INFO", "job_completed", `ซิงก์เสร็จสมบูรณ์ — ไม่มีวิดีโอที่ต้องส่งใหม่ (ข้าม ${skippedMovies} รายการ)`);
    return;
  }

  const cursor: PushCursor = { pushQueue };
  await prisma.siteSyncJob.update({
    where: { id: job.id },
    data: {
      totalMovies,
      scannedMovies: totalMovies,
      matchedMovies,
      skippedMovies,
      queuedMovies,
      processedMovies: 0,
      phase: "pushing",
      status: "PROCESSING",
      progress: 30,
      cursor: cursor as Prisma.InputJsonValue,
    },
  });
  await writeLog(job.id, "INFO", "compare_completed", `เปรียบเทียบเสร็จสิ้น — พบแล้ว ${skippedMovies} รายการ, ต้องส่งใหม่ ${queuedMovies} รายการ`);
}

export async function runPushBatch(job: JobWithSite): Promise<void> {
  const cursor = (job.cursor as PushCursor) ?? {};
  const pushQueue = cursor.pushQueue ?? [];
  if (pushQueue.length === 0) {
    await finalizeJob(job.id, job.failedCount > 0 ? "PARTIAL" : "COMPLETED");
    await writeLog(job.id, "INFO", "job_completed", "ซิงก์เสร็จสมบูรณ์");
    return;
  }

  const batchIds = pushQueue.slice(0, PUSH_BATCH_SIZE);
  const remaining = pushQueue.slice(PUSH_BATCH_SIZE);

  const [movies, drafts, distributions] = await Promise.all([
    prisma.movie.findMany({ where: { id: { in: batchIds } } }),
    prisma.movieSiteDraft.findMany({ where: { siteId: job.siteId, movieId: { in: batchIds } } }),
    prisma.distribution.findMany({ where: { siteId: job.siteId, movieId: { in: batchIds } } }),
  ]);
  const movieById = new Map(movies.map((m) => [m.id, m]));
  const draftByMovieId = new Map(drafts.map((d) => [d.movieId, d]));
  const distByMovieId = new Map(distributions.map((d) => [d.movieId, d]));

  let batchSuccess = 0;
  let batchFailed = 0;

  for (let i = 0; i < batchIds.length; i += PUSH_CONCURRENCY) {
    const chunk = batchIds.slice(i, i + PUSH_CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map(async (movieId) => {
        const movie = movieById.get(movieId);
        if (!movie) {
          await writeLog(job.id, "WARN", "movie_missing", "ไม่พบวิดีโอนี้แล้ว (อาจถูกลบ) — ข้าม", { movieId });
          return { success: true };
        }

        // Crash-recovery guard: if a previous tick's WordPress post actually
        // succeeded but the process died before this batch's counters/cursor
        // were persisted, distributeToSite() already committed Distribution
        // to SUCCESS — re-checking here avoids creating a second WordPress post.
        const existing = distByMovieId.get(movieId);
        if (existing?.status === "SUCCESS" && existing.remotePostId) {
          await writeLog(job.id, "INFO", "already_published_skip", "พบว่าเผยแพร่สำเร็จแล้วจากรอบก่อนหน้า — ข้ามการส่งซ้ำ", {
            movieId,
            remotePostId: existing.remotePostId,
            remotePostUrl: existing.remotePostUrl ?? undefined,
          });
          return { success: true };
        }

        const result = await distributeToSite(movie, job.site, draftByMovieId.get(movieId));
        if (result.status === "success") {
          await writeLog(job.id, "INFO", "published", `ส่งวิดีโอสำเร็จ: ${movie.title}`, {
            movieId,
            remotePostId: result.postId ? String(result.postId) : undefined,
            remotePostUrl: result.url,
          });
          return { success: true };
        }
        await writeLog(job.id, "ERROR", "publish_failed", `ส่งวิดีโอไม่สำเร็จ: ${movie.title} — ${result.error ?? "unknown error"}`, { movieId });
        return { success: false };
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value.success) batchSuccess += 1;
      else batchFailed += 1;
    }
  }

  const processedMovies = job.processedMovies + batchIds.length;
  const successCount = job.successCount + batchSuccess;
  const failedCount = job.failedCount + batchFailed;
  // job.queuedMovies is fixed once compare phase hands off to pushing (never 0 here — a 0-queue job
  // completes immediately at the end of runScanAndCompare and never reaches this function).
  const progress = Math.min(99, 30 + Math.round((70 * processedMovies) / job.queuedMovies));

  if (remaining.length === 0) {
    await prisma.siteSyncJob.update({
      where: { id: job.id },
      data: {
        processedMovies,
        successCount,
        failedCount,
        cursor: { pushQueue: [] } as Prisma.InputJsonValue,
        status: failedCount > 0 ? "PARTIAL" : "COMPLETED",
        phase: failedCount > 0 ? "partial" : "completed",
        progress: 100,
        finishedAt: new Date(),
        activeSiteId: null,
        lockedUntil: null,
      },
    });
    await writeLog(job.id, "INFO", "job_completed", `ซิงก์เสร็จสมบูรณ์ — สำเร็จ ${successCount} รายการ, ล้มเหลว ${failedCount} รายการ`);
    return;
  }

  await prisma.siteSyncJob.update({
    where: { id: job.id },
    data: {
      processedMovies,
      successCount,
      failedCount,
      progress,
      cursor: { pushQueue: remaining } as Prisma.InputJsonValue,
    },
  });
}

/** Gap between one self-chained tick finishing and the next firing — see scheduleFollowUpTick(). */
const FOLLOW_UP_DELAY_MS = 1_500;

/** Best-effort immediate kick so a fresh job doesn't have to wait for the next external cron tick — never the sole delivery mechanism (see /api/cron/site-sync-worker). */
export function triggerWorkerBestEffort(origin: string, systemKey: string | undefined): void {
  if (!systemKey) return;
  fetch(`${origin}/api/cron/site-sync-worker`, {
    method: "POST",
    headers: { "x-system-key": systemKey },
  }).catch(() => {});
}

/**
 * Self-chains another worker tick a couple seconds after this one, as long as
 * this tick actually claimed something — called from the
 * /api/cron/site-sync-worker route itself so a job keeps moving every ~1.5s
 * while it has work left, instead of waiting for the next external cron
 * interval (which may be a minute or more). This is what makes local dev
 * usable without configuring a cron at all.
 *
 * This only works because the app runs as a long-lived Node process
 * (Coolify/Docker `next start`, or `next dev`) where a `setTimeout` fires
 * later in the same process — it would silently do nothing on a serverless
 * platform that freezes the function after the response is sent. The
 * external cron (README) remains the durable guarantee: if the process
 * restarts mid-chain, the cron's own next tick picks the job back up via its
 * stale-lock recovery, same as any other crash.
 */
export function scheduleFollowUpTick(origin: string, systemKey: string | undefined, claimed: number): void {
  if (!systemKey || claimed === 0) return;
  setTimeout(() => {
    fetch(`${origin}/api/cron/site-sync-worker`, {
      method: "POST",
      headers: { "x-system-key": systemKey },
    }).catch(() => {});
  }, FOLLOW_UP_DELAY_MS);
}
