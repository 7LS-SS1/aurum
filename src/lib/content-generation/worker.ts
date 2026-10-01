import { randomUUID } from "node:crypto";
import { Prisma, type ContentGenerationItem, type ContentGenerationJob } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { readAiConfig } from "@/lib/content-ai";
import { aiProvider, type AiProvider } from "@/lib/ai-provider";
import { draftFingerprint, type ContentSourceSnapshot } from "./fingerprints";
import { ContentGenerationProviderError, generateSiteContent } from "./provider";
import { refreshContentGenerationJob } from "./job-service";

const LEASE_MS = 120_000;
const MAX_CANDIDATES_PER_TICK = 8;
const ITEMS_PER_JOB_TICK = 3;
const FOLLOW_UP_DELAY_MS = 2_000;

export const PROVIDER_LIMITS: Record<AiProvider, { concurrency: number; requestsPerMinute: number }> = {
  openai: { concurrency: 2, requestsPerMinute: 10 },
  grok: { concurrency: 1, requestsPerMinute: 6 },
};

type ClaimedJob = ContentGenerationJob & { recovered: boolean };

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : "content_generation_unknown_error").slice(0, 1000);
}

async function writeLog(
  jobId: string,
  level: "INFO" | "WARN" | "ERROR",
  event: string,
  message: string,
  options: { itemId?: string; metadata?: Record<string, unknown> } = {},
): Promise<void> {
  await prisma.contentGenerationJobLog.create({
    data: {
      jobId,
      itemId: options.itemId,
      level,
      event,
      message: message.slice(0, 2000),
      metadata: (options.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

async function claimJob(jobId: string, workerId: string): Promise<ClaimedJob | null> {
  return prisma.$transaction(async tx => {
    const now = new Date();
    const job = await tx.contentGenerationJob.findUnique({ where: { id: jobId } });
    if (!job || !["QUEUED", "PROCESSING"].includes(job.status)) return null;
    if (job.lockedUntil && job.lockedUntil >= now) return null;

    const provider = aiProvider(job.provider);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`content-generation-provider:${provider}`}))`;
    const activeForProvider = await tx.contentGenerationJob.count({
      where: {
        id: { not: job.id },
        provider,
        status: { in: ["QUEUED", "PROCESSING"] },
        lockedUntil: { gt: now },
      },
    });
    if (activeForProvider >= PROVIDER_LIMITS[provider].concurrency) return null;

    const claimed = await tx.contentGenerationJob.updateMany({
      where: {
        id: job.id,
        status: { in: ["QUEUED", "PROCESSING"] },
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
      },
      data: {
        status: "PROCESSING",
        phase: "generating",
        lockedBy: workerId,
        lockedUntil: new Date(now.getTime() + LEASE_MS),
        heartbeatAt: now,
        startedAt: job.startedAt ?? now,
      },
    });
    if (claimed.count !== 1) return null;
    return { ...job, status: "PROCESSING", lockedBy: workerId, recovered: job.status === "PROCESSING" } as ClaimedJob;
  });
}

async function reserveProviderRequest(job: ContentGenerationJob): Promise<{ allowed: true } | { allowed: false; retryAt: Date }> {
  const provider = aiProvider(job.provider);
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`content-generation-rate:${provider}`}))`;
    const since = new Date(Date.now() - 60_000);
    const used = await tx.contentGenerationJobLog.count({
      where: { event: "provider_request_started", createdAt: { gte: since }, job: { provider } },
    });
    if (used >= PROVIDER_LIMITS[provider].requestsPerMinute) {
      const oldest = await tx.contentGenerationJobLog.findFirst({
        where: { event: "provider_request_started", createdAt: { gte: since }, job: { provider } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      });
      return { allowed: false as const, retryAt: new Date((oldest?.createdAt.getTime() ?? Date.now()) + 60_000) };
    }
    await tx.contentGenerationJobLog.create({
      data: { jobId: job.id, event: "provider_request_started", message: `เริ่มเรียก ${provider}`, metadata: { provider } },
    });
    return { allowed: true as const };
  });
}

function retryDelayMs(retryCount: number): number {
  return Math.min(15 * 60_000, 30_000 * 2 ** Math.max(0, retryCount - 1));
}

async function markFailure(item: ContentGenerationItem, error: unknown): Promise<void> {
  const retryCount = item.retryCount + 1;
  const retryable = error instanceof ContentGenerationProviderError && error.retryable && retryCount <= item.maxRetries;
  const message = errorMessage(error);
  if (retryable) {
    const nextRetryAt = new Date(Date.now() + retryDelayMs(retryCount));
    await prisma.contentGenerationItem.updateMany({
      where: { id: item.id, status: "GENERATING" },
      data: { status: "QUEUED", retryCount, nextRetryAt, errorMessage: message },
    });
    await writeLog(item.jobId, "WARN", "item_retry_scheduled", "AI ตอบกลับชั่วคราวไม่สำเร็จ จัดคิวลองใหม่แล้ว", {
      itemId: item.id, metadata: { retryCount, nextRetryAt: nextRetryAt.toISOString(), code: message },
    });
    return;
  }
  await prisma.contentGenerationItem.updateMany({
    where: { id: item.id, status: "GENERATING" },
    data: { status: "FAILED", retryCount, nextRetryAt: null, errorMessage: message },
  });
  await writeLog(item.jobId, "ERROR", "item_failed", "สร้างเนื้อหาไม่สำเร็จ", {
    itemId: item.id, metadata: { retryCount, code: message },
  });
}

async function processItem(job: ContentGenerationJob, item: ContentGenerationItem, apiKey: string): Promise<void> {
  const claimed = await prisma.contentGenerationItem.updateMany({
    where: { id: item.id, status: "QUEUED", OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }] },
    data: { status: "GENERATING", nextRetryAt: null, errorMessage: null },
  });
  if (claimed.count !== 1) return;

  const reservation = await reserveProviderRequest(job);
  if (!reservation.allowed) {
    await prisma.contentGenerationItem.updateMany({
      where: { id: item.id, status: "GENERATING" },
      data: { status: "QUEUED", nextRetryAt: reservation.retryAt },
    });
    return;
  }

  try {
    const [site, avoidRows] = await Promise.all([
      prisma.targetSite.findUnique({ where: { id: item.siteId }, select: { id: true, name: true, baseUrl: true } }),
      prisma.contentGenerationItem.findMany({
        where: {
          id: { not: item.id },
          status: { in: ["READY_FOR_REVIEW", "APPROVED"] },
          draftTitle: { not: null },
        },
        orderBy: { generatedAt: "desc" },
        take: 50,
        select: { draftTitle: true },
      }),
    ]);
    if (!site) throw new ContentGenerationProviderError("content_generation_site_missing", { retryable: false });
    const source: ContentSourceSnapshot = {
      title: item.sourceTitle,
      description: item.sourceDescription,
      categories: stringArray(item.sourceCategories),
      tags: stringArray(item.sourceTags),
      actors: stringArray(item.sourceActors),
    };
    const result = await generateSiteContent({
      apiKey,
      provider: aiProvider(job.provider),
      model: job.model,
      source,
      site,
      trendKeywords: stringArray(item.trendKeywords),
      avoidTitles: avoidRows.flatMap(row => row.draftTitle ? [row.draftTitle] : []),
    });
    const fingerprint = draftFingerprint({
      sourceFingerprint: item.sourceFingerprint,
      title: result.titleLong,
      description: result.descriptionLong,
      focusKeyword: result.focusKeyword,
    });
    await prisma.contentGenerationItem.updateMany({
      where: { id: item.id, status: "GENERATING" },
      data: {
        status: "READY_FOR_REVIEW",
        generatedTitleShort: result.titleShort,
        generatedTitleLong: result.titleLong,
        generatedDescriptionShort: result.descriptionShort,
        generatedDescriptionLong: result.descriptionLong,
        focusKeyword: result.focusKeyword,
        draftTitle: result.titleLong,
        draftDescription: result.descriptionLong,
        draftFocusKeyword: result.focusKeyword,
        draftFingerprint: fingerprint,
        generatedAt: new Date(),
        nextRetryAt: null,
        errorMessage: null,
      },
    });
    await writeLog(job.id, "INFO", "item_ready_for_review", "สร้าง draft พร้อมตรวจแล้ว", { itemId: item.id });
  } catch (error) {
    await markFailure(item, error);
  }
}

async function processClaimedJob(job: ClaimedJob, workerId: string): Promise<void> {
  const heartbeat = setInterval(() => {
    prisma.contentGenerationJob.updateMany({
      where: { id: job.id, lockedBy: workerId, status: "PROCESSING" },
      data: { lockedUntil: new Date(Date.now() + LEASE_MS), heartbeatAt: new Date() },
    }).catch(() => {});
  }, LEASE_MS / 3);
  heartbeat.unref();

  try {
    if (job.recovered) {
      const recovered = await prisma.contentGenerationItem.updateMany({
        where: { jobId: job.id, status: "GENERATING" },
        data: { status: "QUEUED", nextRetryAt: new Date(), errorMessage: "worker_lease_recovered" },
      });
      if (recovered.count) await writeLog(job.id, "WARN", "lease_recovered", `กู้คืนงานค้าง ${recovered.count} รายการ`);
    }

    const config = await readAiConfig({ requireStorage: true, provider: aiProvider(job.provider) });
    if (!config?.enabled) throw new ContentGenerationProviderError("content_ai_disabled", { retryable: false });
    const apiKey = decrypt({ ciphertext: config.apiKeyEnc, iv: config.apiKeyIv, tag: config.apiKeyTag });
    const items = await prisma.contentGenerationItem.findMany({
      where: {
        jobId: job.id,
        status: "QUEUED",
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
      },
      orderBy: [{ nextRetryAt: "asc" }, { createdAt: "asc" }],
      take: aiProvider(job.provider) === "grok" ? 2 : ITEMS_PER_JOB_TICK,
    });
    for (const item of items) {
      const state = await prisma.contentGenerationJob.findUnique({ where: { id: job.id }, select: { status: true } });
      if (!state || state.status === "CANCELLED") break;
      await processItem(job, item, apiKey);
      await prisma.contentGenerationJob.updateMany({
        where: { id: job.id, lockedBy: workerId, status: "PROCESSING" },
        data: { cursor: { lastItemId: item.id, checkpointAt: new Date().toISOString() } },
      });
    }
    await refreshContentGenerationJob(job.id);
  } catch (error) {
    const items = await prisma.contentGenerationItem.findMany({
      where: { jobId: job.id, status: { in: ["QUEUED", "GENERATING"] } }, take: ITEMS_PER_JOB_TICK,
    });
    for (const item of items) {
      await prisma.contentGenerationItem.updateMany({
        where: { id: item.id, status: { in: ["QUEUED", "GENERATING"] } },
        data: { status: "GENERATING" },
      });
      await markFailure(item, error);
    }
    await writeLog(job.id, "ERROR", "job_step_failed", "Worker ไม่สามารถประมวลผลคิวได้", { metadata: { code: errorMessage(error) } });
    await refreshContentGenerationJob(job.id);
  } finally {
    clearInterval(heartbeat);
    await prisma.contentGenerationJob.updateMany({
      where: { id: job.id, lockedBy: workerId, status: { in: ["QUEUED", "PROCESSING", "CANCELLED"] } },
      data: { lockedBy: null, lockedUntil: null },
    });
  }
}

export async function runContentGenerationWorkerTick(workerId = `content:${randomUUID()}`): Promise<{ claimed: number; jobIds: string[]; nextRunAt: string | null }> {
  const now = new Date();
  const candidates = await prisma.contentGenerationJob.findMany({
    where: {
      status: { in: ["QUEUED", "PROCESSING"] },
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
      items: { some: { status: { in: ["QUEUED", "GENERATING"] }, OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] } },
    },
    orderBy: { createdAt: "asc" },
    take: MAX_CANDIDATES_PER_TICK,
    select: { id: true },
  });

  const claimed: ClaimedJob[] = [];
  for (const candidate of candidates) {
    const job = await claimJob(candidate.id, workerId);
    if (job) claimed.push(job);
  }
  await Promise.allSettled(claimed.map(job => processClaimedJob(job, workerId)));
  const nextQueuedItem = await prisma.contentGenerationItem.findFirst({
    where: {
      status: "QUEUED",
      job: {
        status: { in: ["QUEUED", "PROCESSING"] },
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }],
      },
    },
    orderBy: [{ nextRetryAt: "asc" }, { createdAt: "asc" }],
    select: { nextRetryAt: true },
  });
  return {
    claimed: claimed.length,
    jobIds: claimed.map(job => job.id),
    nextRunAt: nextQueuedItem ? (nextQueuedItem.nextRetryAt ?? new Date()).toISOString() : null,
  };
}

export function triggerContentGenerationWorkerBestEffort(origin: string, systemKey: string | undefined): void {
  if (!systemKey) return;
  fetch(`${origin}/api/cron/content-generation-worker`, { method: "POST", headers: { "x-system-key": systemKey } }).catch(() => {});
}

export function scheduleContentGenerationFollowUp(origin: string, systemKey: string | undefined, claimed: number, nextRunAt: string | null): void {
  if (!systemKey || (claimed === 0 && !nextRunAt)) return;
  const retryDelay = nextRunAt ? Date.parse(nextRunAt) - Date.now() + 500 : FOLLOW_UP_DELAY_MS;
  const delay = Math.max(FOLLOW_UP_DELAY_MS, Math.min(15 * 60_000, retryDelay));
  setTimeout(() => triggerContentGenerationWorkerBestEffort(origin, systemKey), delay);
}
