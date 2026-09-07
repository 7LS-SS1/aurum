import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({ log: [] });
try {
  const [statuses, movies, failed, sites] = await Promise.all([
    db.distribution.groupBy({ by: ['status'], _count: { _all: true } }),
    db.movie.groupBy({ by: ['status'], _count: { _all: true } }),
    db.distribution.findMany({ where: { status: 'FAILED' }, select: {
      siteId: true, movieId: true, errorMessage: true, remotePostId: true, attempts: true, updatedAt: true,
      movie: { select: { status: true } },
    } }),
    db.targetSite.findMany({ select: { id: true, name: true, baseUrl: true, isActive: true, healthStatus: true, lastCheckedAt: true } }),
  ]);
  const groups = new Map();
  const categories = {};
  const clean = s => (s ?? '').replace(/https?:\/\/[^\s\]]+/g, value => {
    try { const u = new URL(value); return u.origin + u.pathname; } catch { return '[URL]'; }
  });
  for (const row of failed) {
    const error = row.errorMessage ?? '';
    const category = error.includes('did not persist REST meta') ? 'metadata_verification' : error.includes('Error establishing a database connection') ? 'wordpress_database' : error.includes('HTTP 500') ? 'http_500' : error.includes('timeout') ? 'timeout' : 'other';
    categories[category] = (categories[category] ?? 0) + 1;
    const message = clean(row.errorMessage).replace(/WordPress post \d+/g, 'WordPress post <id>');
    const key = row.siteId + '|' + message;
    if (!groups.has(key)) groups.set(key, { siteId: row.siteId, message, count: 0, withRemoteId: 0, first: row.updatedAt, last: row.updatedAt });
    const g = groups.get(key); g.count++; if (row.remotePostId) g.withRemoteId++;
    if (row.updatedAt < g.first) g.first = row.updatedAt;
    if (row.updatedAt > g.last) g.last = row.updatedAt;
  }
  console.log(JSON.stringify({ capturedAt: new Date(), statuses, movies, categories,
    failedUniqueMovies: new Set(failed.map(r => r.movieId)).size,
    failedOnDoneMovies: failed.filter(r => r.movie.status === 'DONE').length,
    failedWithRemoteId: failed.filter(r => r.remotePostId).length,
    sites: sites.map(s => ({ ...s, baseUrl: clean(s.baseUrl), failed: failed.filter(r => r.siteId === s.id).length })),
    groups: [...groups.values()].sort((a,b) => b.count-a.count),
  }, null, 2));
} finally { await db.$disconnect(); }
