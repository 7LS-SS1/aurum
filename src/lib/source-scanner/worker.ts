import type { VideoSource } from "@prisma/client";
import { statfs } from "node:fs/promises";
import { tmpdir } from "node:os";
import { prisma } from "@/lib/prisma";
import { slugifyTitle } from "@/lib/slug";
import { readListing, resolveItem, DiscoveredItem } from "./adapters";
import { mayContinue, mayStart, retryAt, scanIsDue, scannerError, ScannerError } from "./contracts";
import { ingestMedia } from "./media";
import { networkContext, SourceFetch } from "./network";
import { claimItem, claimPage, event, fence, hostBackoffPolicy, recoverStale, withScannerLease } from "./store";

const names = (value: unknown) => Array.isArray(value) ? value.map(String) : [];
async function canStart(id: string, stopVersion: number) {
  const current = await prisma.videoSource.findUnique({ where: { id } });
  return current && mayStart(current) && current.stopVersion === stopVersion;
}
export async function scanPages(source: VideoSource, lease: string, fetcher: SourceFetch, signal: AbortSignal) {
  if (!scanIsDue(source)) return;
  await prisma.$transaction(async (tx) => {
    await fence(tx, source, lease);
    if (source.scanComplete) {
      await tx.sourcePage.deleteMany({ where: { sourceId: source.id } });
      await tx.videoSource.update({ where: { id: source.id }, data: { scanComplete: false } });
    }
    await tx.sourcePage.upsert({ where: { sourceId_url: { sourceId: source.id, url: source.baseUrl } }, create: { sourceId: source.id, url: source.baseUrl }, update: {} });
  });
  for (let n = 0; n < source.maxPagesPerRun && !signal.aborted; n++) {
    if (!await canStart(source.id, source.stopVersion)) break;
    const page = await claimPage(source.id, source.stopVersion); if (!page) break;
    try {
      const listing = await readListing(page.url, source, fetcher);
      signal.throwIfAborted();
      await prisma.$transaction(async (tx) => {
        await fence(tx, source, lease);
        const nextPages = listing.next ? [listing.next, ...(listing.additionalPages ?? [])] : [];
        const known = nextPages.length ? await tx.sourcePage.findFirst({ where: { sourceId: source.id, url: { in: nextPages } }, select: { id: true } }) : null;
        if (known) throw new ScannerError("PAGINATION_LOOP");
        const total = await tx.sourceItem.count({ where: { sourceId: source.id } });
        const unique = new Map(listing.items.map((item) => [item.externalId, item]));
        const existing = unique.size ? await tx.sourceItem.findMany({
          where: { sourceId: source.id, externalId: { in: [...unique.keys()] } },
          select: { id: true, externalId: true, mediaUrl: true, coverUrl: true, pageUrl: true },
        }) : [];
        for (const row of existing) {
          const item = unique.get(row.externalId)!;
          unique.delete(row.externalId);
          // Refresh rotating catalog URLs. HTML links never overwrite resolved metadata.
          if (source.adapter === "JSON_CATALOG" && (item.mediaUrl !== row.mediaUrl || item.coverUrl !== row.coverUrl || item.pageUrl !== row.pageUrl)) {
            await tx.sourceItem.updateMany({ where: { id: row.id, state: { in: ["PENDING", "FAILED", "UNSUPPORTED"] } }, data: item });
          }
        }
        const capacity = Math.max(0, source.maxItemsTotal - total);
        const limited = unique.size > capacity;
        const discovered = [...unique.values()].slice(0, capacity);
        if (discovered.length) await tx.sourceItem.createMany({ data: discovered.map((item) => ({ sourceId: source.id, ...item })) });
        const code = limited ? "ITEM_LIMIT" : listing.paginationError;
        const pageError = code ? new ScannerError(code).message : null;
        const changed = await tx.sourcePage.updateMany({ where: { id: page.id, claimToken: page.claimToken, state: "RUNNING" }, data: {
          state: code ? "FAILED" : "DONE", terminal: !code && listing.terminal, claimToken: null,
          errorCode: code ?? null, error: pageError,
        } });
        if (!changed.count) throw new ScannerError("STOPPED");
        if (nextPages.length && !code) await tx.sourcePage.createMany({ data: nextPages.map((url) => ({ sourceId: source.id, url })) });
        if (listing.terminal && !code && !await tx.sourcePage.count({ where: { sourceId: source.id, state: { not: "DONE" } } })) {
          await tx.videoSource.update({ where: { id: source.id }, data: { scanComplete: true, nextScanAt: new Date(Date.now() + source.scanIntervalMinutes * 60_000) } });
        }
        await event(tx, source.id, code ?? "PAGE_DONE", pageError ?? `สแกนหน้าสำเร็จ พบ ${listing.items.length} รายการ${listing.terminal ? " · สิ้นสุดรายการ" : ""}`);
      }, { timeout: 30_000 });
    } catch (raw) {
      const error = scannerError(signal.aborted ? signal.reason : raw);
      const stopped = error.code === "STOPPED";
      const retry = stopped || page.attempts < 3;
      await prisma.$transaction(async (tx) => {
        const changed = await tx.sourcePage.updateMany({ where: { id: page.id, claimToken: page.claimToken }, data: { state: retry ? "PENDING" : "FAILED", claimToken: null,
          attempts: stopped ? { decrement: 1 } : undefined, retryAt: error.retryAfter ?? retryAt(page.attempts), error: error.message, errorCode: error.code } });
        if (changed.count) await event(tx, source.id, error.code, error.message);
      });
      if (signal.aborted) throw error;
      break;
    }
  }
  await prisma.videoSource.updateMany({ where: { id: source.id, stopVersion: source.stopVersion }, data: { lastScanAt: new Date() } });
}

export async function processItem(source: VideoSource, lease: string, fetcher: SourceFetch, signal: AbortSignal) {
  if (!await canStart(source.id, source.stopVersion)) return null;
  const item = await claimItem(source.id, source.stopVersion); if (!item) return null;
  let media: Awaited<ReturnType<typeof ingestMedia>> | undefined;
  let committed = false;
  let cleanupSafe = true;
  try {
    const metadata = await resolveItem({ ...item, tags: names(item.tags), categories: names(item.categories) } as DiscoveredItem, source, fetcher);
    signal.throwIfAborted();
    const changed = await prisma.sourceItem.updateMany({ where: { id: item.id, claimToken: item.claimToken, state: "RESOLVING" }, data: { title: metadata.title, description: metadata.description, mediaUrl: metadata.mediaUrl, coverUrl: metadata.coverUrl, tags: metadata.tags, categories: metadata.categories, state: "DOWNLOADING" } });
    if (!changed.count) throw new ScannerError("STOPPED");
    media = await ingestMedia({ sourceId: source.id, itemId: item.id, mediaUrl: metadata.mediaUrl!, coverUrl: metadata.coverUrl,
      maxBytes: Number(source.maxFileBytes), fetcher, signal,
      progress: async (bytes) => { signal.throwIfAborted(); await prisma.sourceItem.updateMany({ where: { id: item.id, claimToken: item.claimToken, state: "DOWNLOADING" }, data: { bytes: BigInt(bytes) } }); },
    });
    signal.throwIfAborted();
    const saved = media;
    const movieId = `scan_${item.id}`;
    cleanupSafe = false;
    await prisma.$transaction(async (tx) => {
      await fence(tx, source, lease);
      const completed = await tx.sourceItem.updateMany({ where: { id: item.id, claimToken: item.claimToken, state: "DOWNLOADING" }, data: {
        state: "DONE", claimToken: null, movieId, bytes: BigInt(saved.bytes), durationSec: saved.durationSec, finishedAt: new Date(), error: null, errorCode: null,
      } });
      if (!completed.count) throw new ScannerError("STOPPED");
      const sites = await tx.targetSite.findMany({ where: { isActive: true }, select: { id: true, mainCategories: true } });
      const targetSiteIds = sites.filter((site) => !names(site.mainCategories).length || names(site.mainCategories).includes(source.mainCategory)).map((s) => s.id);
      const tags = [...new Set([...metadata.tags, ...names(source.defaultTags)])];
      await tx.movie.create({ data: { id: movieId, title: metadata.title, slug: `${slugifyTitle(metadata.title, "video").slice(0, 150)}-${item.id}`,
        excerpt: metadata.description, mainCategory: source.mainCategory, categories: metadata.categories,
        videoUrl: saved.videoUrl, videoProvider: "r2", thumbnailUrl: saved.thumbnailUrl, status: "READY_FOR_REVIEW", targetSiteIds,
        tags: { connectOrCreate: tags.map((name) => ({ where: { name }, create: { name } })) },
        extraMeta: { scan: { sourceId: source.id, itemId: item.id, sourceUrl: item.pageUrl, durationSec: saved.durationSec, bytes: saved.bytes } },
      } });
      await tx.auditLog.create({ data: { actorRole: "SYSTEM", action: "source_movie_ready_for_review", resourceType: "movie", resourceId: movieId, metadata: { sourceId: source.id, itemId: item.id } } });
      await event(tx, source.id, "ITEM_DONE", "ดาวน์โหลดและตรวจไฟล์สำเร็จ ส่งเข้ารอตรวจสอบแล้ว", item.id);
    }, { timeout: 30_000 });
    committed = true;
    return { id: item.id, status: "DONE", movieId };
  } catch (raw) {
    // Resolve ambiguous transaction completion before deleting a potentially committed object.
    const existing = await prisma.sourceItem.findUnique({ where: { id: item.id }, select: { state: true, movieId: true } });
    if (existing?.state === "DONE") { committed = true; return { id: item.id, status: "DONE", movieId: existing.movieId }; }
    cleanupSafe = true;
    const error = scannerError(signal.aborted ? signal.reason : raw);
    const stopped = error.code === "STOPPED";
    const unsupported = error.code === "UNSUPPORTED_PLAYER" || error.code === "AMBIGUOUS_MEDIA";
    const state = stopped ? "PENDING" : unsupported ? "UNSUPPORTED" : item.attempts < 3 ? "PENDING" : "FAILED";
    await prisma.$transaction(async (tx) => {
      const changed = await tx.sourceItem.updateMany({ where: { id: item.id, claimToken: item.claimToken }, data: { state, claimToken: null, attempts: stopped ? { decrement: 1 } : undefined,
        error: error.message, errorCode: error.code, retryAt: error.retryAfter ?? retryAt(item.attempts), startedAt: null, bytes: BigInt(0), finishedAt: state === "PENDING" ? null : new Date() } });
      if (changed.count) await event(tx, source.id, error.code, error.message, item.id);
    });
    return { id: item.id, status: state, error: error.message };
  } finally { if (media && !committed && cleanupSafe) await media.cleanup(); }
}

async function sampleWorker() {
  const disk = await statfs(tmpdir(), { bigint: true }).catch(() => null);
  const data = { sampledAt: new Date(), freeBytes: disk ? disk.bavail * disk.bsize : null, totalBytes: disk ? disk.blocks * disk.bsize : null };
  await prisma.scannerWorkerStatus.upsert({ where: { id: "scanner" }, create: { id: "scanner", ...data }, update: data });
}

export async function runScanner(budgetMs = 270_000, sourceId?: string) {
  await sampleWorker();
  return withScannerLease(async (lease) => {
    const controller = new AbortController();
    // Reserve cleanup time within the 270-second HTTP budget.
    const timer = setTimeout(() => controller.abort(new ScannerError("TIMEOUT")), Math.max(1, budgetMs - 10_000));
    const results: { sourceId: string; item?: Awaited<ReturnType<typeof processItem>>; error?: string }[] = [];
    try {
      await recoverStale();
      const network = networkContext(controller.signal, undefined, await hostBackoffPolicy());
      const now = new Date();
      const sources = await prisma.videoSource.findMany({ where: { id: sourceId, control: "RUN", deletedAt: null,
        OR: [
          { nextScanAt: { lte: now }, scanComplete: true, scanIntervalMinutes: { gt: 0 } },
          { nextScanAt: { lte: now }, scanComplete: false, OR: [{ pages: { none: {} } }, { pages: { some: { state: "PENDING", retryAt: { lte: now } } } }] },
          { items: { some: { state: "PENDING", retryAt: { lte: now } } } },
        ] },
        orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }], take: 20 });
      for (const source of sources) {
        if (controller.signal.aborted) break;
        if (!await canStart(source.id, source.stopVersion)) continue;
        const local = new AbortController();
        const signal = AbortSignal.any([controller.signal, local.signal]);
        let checking = false;
        const poll = setInterval(async () => {
          if (checking) return; checking = true;
          try {
            const current = await prisma.videoSource.findUnique({ where: { id: source.id } });
            if (!current || !mayContinue(current, source.stopVersion)) local.abort(new ScannerError("STOPPED"));
          } catch { local.abort(new ScannerError("INTERNAL")); }
          finally { checking = false; }
        }, 1000);
        const fetcher = network(source.allowedHosts as string[], source.requestIntervalMs, signal);
        try {
          await scanPages(source, lease, fetcher, signal);
          const item = await processItem(source, lease, fetcher, signal);
          results.push({ sourceId: source.id, item });
        } catch (error) { results.push({ sourceId: source.id, error: scannerError(signal.aborted ? signal.reason : error).message }); }
        finally { clearInterval(poll); }
      }
      return { processed: results.length, results };
    } finally { clearTimeout(timer); }
  });
}
