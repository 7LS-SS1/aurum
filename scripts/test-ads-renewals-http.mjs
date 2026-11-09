import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { writeFile, unlink } from 'node:fs/promises';
const dbUrl = new URL(process.env.DATABASE_URL || 'http://invalid');
if (dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== '55439' || dbUrl.pathname !== '/aurum_ads_test') throw Error('Isolated local database only');
const db = new PrismaClient(), base = 'http://localhost:3007', viewerId = randomUUID(), ids = [], files = [];
const email = `renewal-ui-${viewerId}@example.test`, password = 'Local-renewal-test-only-2026';
const request = (path, options = {}) => fetch(base + path, { ...options, signal: AbortSignal.timeout(90000) });
const json = async (response, status = 200) => { assert.equal(response.status, status, await response.clone().text()); return response.json(); };
let keep = false;
try {
  await db.viewer.create({ data: { id: viewerId, email, displayName: 'Renewal UI Demo', passwordHash: await bcrypt.hash(password, 12) } });
  const login = await request('/api/public/auth/login', { method: 'POST', headers: { origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }); await json(login);
  const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; '), headers = { cookie, origin: base, 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.71' };
  const config = (await db.servicePageConfig.findUniqueOrThrow({ where: { id: 'ads-banner' } })).config;
  const site = config.websites.find(s => s.enabled);
  const occupied = (await json(await request('/api/public/ads-orders?websiteId=' + site.id))).occupied;
  const candidates = [['home_top',0,0],['home_bottom',0,1],['video_top',1,0],['video_bottom',1,1]].flatMap(([key,group,row]) => ['L1','R1','L2','R2','L3','R3','L4','R4'].map((n,i) => ({ id: `${key}:${n}`, label: `${config.groups[group].rows[row][0]} · ช่อง ${i+1}`, amount: config.groups[group].rows[row][2] })));
  const free = candidates.filter(s => !occupied.includes(s.id)); assert.ok(free.length >= 2);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWMInXk3dOZdBggFADAiBy1VU9MRAAAAAElFTkSuQmCC', 'base64');
  const file = await json(await request('/api/public/ads-attachments', { method: 'POST', headers: { cookie, origin: base, 'Content-Type': 'image/png', 'X-File-Name': 'renewal-demo.png' }, body: png })); files.push(file.id);
  const simulation = amount => ({ mode: 'simulation', version: 1, phase: 'active', method: null, rateTHB: 35, amountTHB: amount, receipt: null });
  async function fixture(slot) {
    const id = randomUUID(); ids.push(id); const end = new Date(Date.now() + 86400000);
    return db.adsOrder.create({ data: { id, viewerId, requestId: randomUUID(), tokenHash: randomUUID(), requestHash: randomUUID(), status: 'ACTIVE', customer: { name: 'Renewal UI Demo', email, contact: '@renewal-test' }, quote: { website: site, items: [slot.label], kind: 'slots', simulation: simulation(slot.amount), attachments: [{ slot: slot.id, fileId: file.id, name: file.name, targetUrl: 'https://brand.example.test' }] }, slots: [slot.id], days: 30, amount: slot.amount, artworkUrl: '', targetUrl: 'https://brand.example.test', startsAt: new Date(end.getTime() - 30*86400000), endsAt: end } });
  }
  const parent = await fixture(free[0]), preview = await fixture(free[1]);
  await json(await request(`/api/public/account/renewal?id=${parent.id}`), 401);
  await json(await request(`/api/public/account/renewal?id=${randomUUID()}`, { headers }), 404);
  const info = await json(await request(`/api/public/account/renewal?id=${parent.id}`, { headers })); assert.equal(info.canRenew, true); assert.equal(info.seed.files[0].fileId, file.id);
  assert.ok(!(await json(await request(`/api/public/ads-orders?websiteId=${site.id}&renewalOfId=${parent.id}`, { headers }))).occupied.includes(parent.slots[0]));
  const body = { renewalOfId: parent.id, renewalMode: 'same', websiteId: site.id, requestId: randomUUID(), kind: 'slots', slots: parent.slots, days: 30, expectedAmount: parent.amount, name: 'Renewal UI Demo', email, contact: '@renewal-test', targetUrl: 'https://brand.example.test', attachments: [{ slot: parent.slots[0], fileId: file.id, targetUrl: 'https://brand.example.test' }], note: 'Local renewal HTTP test', acceptedTerms: true };
  const auth = { ...headers, Authorization: 'Bearer ' + randomBytes(32).toString('hex') };
  await json(await request('/api/public/ads-orders', { method: 'POST', headers: { ...auth, origin: 'https://evil.test' }, body: JSON.stringify(body) }), 403);
  const created = await json(await request('/api/public/ads-orders', { method: 'POST', headers: auth, body: JSON.stringify(body) }), 201); ids.push(created.order.id);
  assert.equal((await json(await request('/api/public/ads-orders', { method: 'POST', headers: auth, body: JSON.stringify(body) }), 201)).order.id, created.order.id);
  let order = created.order;
  for (const input of [{ action: 'select', method: 'qr' }, { action: 'submit', outcome: 'success' }]) {
    order = (await json(await request('/api/public/ads-orders/simulation', { method: 'POST', headers, body: JSON.stringify({ id: order.id, revision: order.revision, ...input }) }))).order;
  }
  const jar = new Map(), collect = r => r.headers.getSetCookie().forEach(c => { const [k,...v] = c.split(';')[0].split('='); jar.set(k,v.join('=')); }), staffCookie = () => [...jar].map(([k,v]) => k+'='+v).join('; ');
  const csrf = await request('/api/auth/csrf'); collect(csrf); const { csrfToken } = await csrf.json();
  collect(await request('/api/auth/callback/credentials', { method: 'POST', redirect: 'manual', headers: { cookie: staffCookie(), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: 'ads-manager@example.test', password: 'Local-services-test-only-2026', csrfToken, callbackUrl: base+'/admin' }) }));
  for (const action of ['sim_verify','sim_activate']) {
    const fresh = await db.adsOrder.findUniqueOrThrow({ where: { id: order.id } });
    await json(await request('/api/ads-orders', { method: 'PUT', headers: { cookie: staffCookie(), origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: fresh.id, revision: fresh.revision, action, note: 'ตรวจต่ออายุทดสอบแล้ว คงตำแหน่งเดิม' }) }));
  }
  const renewed = await db.adsOrder.findUniqueOrThrow({ where: { id: order.id } }); assert.equal(renewed.status, 'SCHEDULED'); assert.equal(renewed.startsAt.getTime(), parent.endsAt.getTime());
  assert.equal((await json(await request(`/api/public/account/renewal?id=${parent.id}`, { headers }))).pending.id, order.id);
  const detail = await json(await request(`/api/ads-orders/${order.id}`, { headers: { cookie: staffCookie() } })); assert.equal(detail.order.renewalOfId, parent.id);
  const page = await request(`/services/ads-banner/book?renew=${preview.id}&mode=same`, { headers }); assert.equal(page.status, 200); assert.ok((await page.text()).includes('ต่ออายุ'));
  console.log('ADS_RENEWALS_HTTP_OK: auth, ownership, origin, seed/files, own inventory, idempotent create, payment, staff approval, scheduled dates, linked detail and booking SSR');
  if (process.argv.includes('--keep-preview')) { keep = true; await writeFile('artifacts/renewal-ui-fixture.json', JSON.stringify({ ids, viewerId, email, password, files, previewId: preview.id, renewedId: order.id })); console.log(JSON.stringify({ previewId: preview.id, renewedId: order.id, email })); }
} finally {
  if (!keep) {
    await db.auditLog.deleteMany({ where: { resourceType: 'ads_order', resourceId: { in: ids } } });
    await db.adsOrder.deleteMany({ where: { id: { in: ids }, renewalOfId: { not: null } } }); await db.adsOrder.deleteMany({ where: { id: { in: ids } } });
    await db.viewerSession.deleteMany({ where: { viewerId } }); await db.viewer.deleteMany({ where: { id: viewerId } });
    for (const id of files) for (const ext of ['.json','.bin']) await unlink('.local-ads-uploads/'+id+ext).catch(() => {});
  }
  await db.$disconnect();
}
