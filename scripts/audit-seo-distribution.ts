/** Read-only diagnostics: never generates AI text or writes drafts/posts/jobs. */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient({ log: [] });

async function main() {
  const config = await prisma.contentAiConfig.findUnique({ where: { id: "default" }, select: { enabled: true, model: true } });
  const where = { errorMessage: { startsWith: "seo_generation_validation_failed" } };
  const [failedCount, failedWithoutRemoteId, failures, logs] = await Promise.all([
    prisma.distribution.count({ where }),
    prisma.distribution.count({ where: { ...where, remotePostId: null } }),
    prisma.distribution.findMany({ where, take: 20, orderBy: { distributedAt: "desc" }, select: {
      movieId: true, siteId: true, remotePostId: true,
      movie: { select: { title: true, tags: { select: { name: true } }, siteDrafts: { select: { title: true } } } },
    } }),
    prisma.siteSyncJobLog.findMany({ where: { message: { contains: "seo_generation_validation_failed" } }, take: 5, orderBy: { createdAt: "desc" }, select: { jobId: true, createdAt: true } }),
  ]);
  console.log(JSON.stringify({ databaseHost: new URL(process.env.DATABASE_URL!).hostname, config, failedCount, failedWithoutRemoteId,
    samples: failures.map(row => ({ movieId: row.movieId, siteId: row.siteId, hasRemotePost: !!row.remotePostId,
      titleLength: row.movie.title.trim().length, titleCannotFit160: row.movie.title.trim().length >= 160,
      titleHasMarkupOrUrl: /[<>]|https?:\/\//i.test(row.movie.title),
      longestKeyword: Math.max(0, ...row.movie.tags.map(tag => tag.name.trim().length)),
      savedTitles: row.movie.siteDrafts.filter(draft => draft.title).length,
    })), recentSyncFailures: logs }, null, 2));
}
main().catch(() => { console.error("seo_distribution_audit_unavailable"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
