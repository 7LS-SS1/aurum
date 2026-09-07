import { prisma } from '../src/lib/prisma';
import { decrypt } from '../src/lib/crypto';

async function main() {
  const sites = await prisma.targetSite.findMany({ where: { name: { in: ['doomhee.com', 'thaitube.live - Toddz', 'boxvide.online'] } } });
  for (const site of sites) {
    const sample = await prisma.distribution.findFirst({ where: { siteId: site.id, status: 'FAILED', remotePostId: { not: null }, errorMessage: { contains: 'did not persist REST meta' } }, orderBy: { updatedAt: 'desc' }, select: { remotePostId: true, movieId: true } });
    const credential = decrypt({ ciphertext: site.credentialEnc, iv: site.credentialIv, tag: site.credentialTag });
    const authorization = site.authType === 'JWT' ? 'Bearer ' + credential : 'Basic ' + Buffer.from(site.wpUsername + ':' + credential).toString('base64');
    const paths = ['/wp-json/wp/v2/users/me?context=edit', '/wp-json/aurum-video-core/v1/diagnostics'];
    if (sample) paths.push('/wp-json/wp/v2/' + site.postType + '/' + sample.remotePostId + '?context=edit&_fields=id,status,meta');
    const results = await Promise.all(paths.map(async path => {
      try {
        const res = await fetch(site.baseUrl.replace(/\/+$/, '') + path, { headers: { Authorization: authorization }, redirect: 'error', signal: AbortSignal.timeout(15000) });
        const raw = await res.text();
        let data: Record<string, unknown> = {}; try { data = JSON.parse(raw); } catch { /* Only report HTTP status and a DB-error marker. */ }
        const meta = data.meta as Record<string, unknown> | undefined;
        return { endpoint: path.split('?')[0], status: res.status, databaseError: raw.includes('Error establishing a database connection'),
          ...(path.includes('diagnostics') ? { ready: data.ready, version: data.version, code: data.code } : {}),
          ...(meta && path.includes('/' + site.postType + '/') ? { remoteId: data.id, postStatus: data.status, metaKeys: Object.keys(meta), identityMatches: meta.aurum_movie_id === sample?.movieId } : {}),
        };
      } catch (error) { return { endpoint: path.split('?')[0], error: error instanceof Error ? error.name : 'UnknownError' }; }
    }));
    console.log(JSON.stringify({ site: site.name, checkedAt: new Date(), results }));
  }
}
main().finally(() => prisma.$disconnect());
