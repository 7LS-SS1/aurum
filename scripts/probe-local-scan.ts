import { prisma } from '../src/lib/prisma';
import { decrypt } from '../src/lib/crypto';
import { WordPressClient } from '../src/lib/wordpress-client';
async function main() {
 const site = await prisma.targetSite.findFirst({ where: { baseUrl: { contains: 'fabrics-registration-traditions-diabetes.trycloudflare.com' } } });
 if (!site) throw new Error('Test site not found');
 const credential = decrypt({ ciphertext: site.credentialEnc, iv: site.credentialIv, tag: site.credentialTag });
 if (process.argv.includes('--full')) {
  const client = new WordPressClient({ baseUrl: site.baseUrl, authType: site.authType, username: site.wpUsername, credential, postType: site.postType });
  const start = Date.now();
  try { const posts = await client.listAllPosts(['publish', 'future', 'draft', 'pending', 'private']); console.log(JSON.stringify({ fullScan: true, count: posts.length, ms: Date.now()-start })); }
  catch (e) { console.log(JSON.stringify({ fullScan: false, ms: Date.now()-start, error: e instanceof Error ? e.message : 'error' })); }
  return;
 }
 const auth = site.authType === 'JWT' ? 'Bearer ' + credential : 'Basic ' + Buffer.from(site.wpUsername + ':' + credential).toString('base64');
 for (const base of [site.baseUrl.replace(/\/+$/, ''), 'http://127.0.0.1:8080']) {
  for (const size of [1, 100]) {
   const start = Date.now();
   try {
    const url = base + '/wp-json/wp/v2/' + site.postType + '?per_page=' + size + '&page=1&status=publish%2Cfuture%2Cdraft%2Cpending%2Cprivate&context=edit&_fields=id%2Clink%2Cslug%2Ctitle%2Cstatus%2Cmeta';
    const res = await fetch(url, { headers: { Authorization: auth }, redirect: 'error', signal: AbortSignal.timeout(25000) });
    const body = await res.text(); let data; try { data = JSON.parse(body); } catch { data = null; }
    console.log(JSON.stringify({ base, size, ms: Date.now()-start, status: res.status, count: Array.isArray(data) ? data.length : undefined, code: data?.code, total: res.headers.get('x-wp-total'), bytes: body.length }));
   } catch (e) { console.log(JSON.stringify({ base, size, ms: Date.now()-start, error: e instanceof Error ? e.name : 'error' })); }
  }
 }
}
main().finally(() => prisma.$disconnect());
