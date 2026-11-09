import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { writeFileSync } from 'node:fs';
const url = new URL(process.env.DATABASE_URL || 'http://invalid');
if (url.hostname !== '127.0.0.1' || url.port !== '55439' || url.pathname !== '/aurum_ads_test') throw Error('Isolated local database only');
const db = new PrismaClient(), base = 'http://localhost:3007', id = randomUUID(), viewerId = randomUUID();
const email = `request-ui-${viewerId}@example.test`, password = 'Local-request-test-only-2026';
const request = (path, options = {}) => fetch(base + path, { ...options, signal: AbortSignal.timeout(90000) });
let keep = false;
try {
  await db.viewer.create({ data: { id: viewerId, email, displayName: 'Request UI Demo', passwordHash: await bcrypt.hash(password, 12) } });
  const start = new Date(), end = new Date(start.getTime() + 30 * 86400000);
  await db.adsOrder.create({ data: { id, viewerId, requestId: randomUUID(), requestHash: randomUUID(), tokenHash: randomUUID(), customer: { name: 'Request UI Demo', email, contact: '@local-test' }, quote: { items: ['Local notification UI fixture'] }, slots: [], days: 30, amount: 1500, artworkUrl: '', targetUrl: '', status: 'ACTIVE', startsAt: start, endsAt: end } });
  assert.equal((await request('/api/ads-notifications')).status, 401);
  assert.equal((await request(`/api/public/account/requests?id=${id}`)).status, 401);
  const login = await request('/api/public/auth/login', { method: 'POST', headers: { origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const headers = { cookie, origin: base, 'Content-Type': 'application/json' };
  const input = { orderId: id, requestId: randomUUID(), kind: 'PAYMENT_ISSUE', reason: 'paid_unconfirmed', message: 'Local test: payment completed but status did not update' };
  assert.equal((await request('/api/public/account/requests', { method: 'POST', headers: { ...headers, origin: 'https://evil.test' }, body: JSON.stringify(input) })).status, 403);
  assert.equal((await request('/api/public/account/requests', { method: 'POST', headers, body: JSON.stringify({ ...input, orderId: randomUUID() }) })).status, 404);
  const created = await request('/api/public/account/requests', { method: 'POST', headers, body: JSON.stringify(input) }); assert.equal(created.status, 201, await created.clone().text());
  const item = await created.json();
  const replay = await request('/api/public/account/requests', { method: 'POST', headers, body: JSON.stringify(input) }); assert.equal(replay.status, 201); assert.equal((await replay.json()).id, item.id);
  const jar = new Map(); const collect = r => r.headers.getSetCookie().forEach(c => { const [k, ...v] = c.split(';')[0].split('='); jar.set(k, v.join('=')); }); const staffCookie = () => [...jar].map(([k, v]) => k + '=' + v).join('; ');
  const csrf = await request('/api/auth/csrf'); collect(csrf); const { csrfToken } = await csrf.json();
  const staffLogin = await request('/api/auth/callback/credentials', { method: 'POST', redirect: 'manual', headers: { cookie: staffCookie(), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: 'ads-manager@example.test', password: 'Local-services-test-only-2026', csrfToken, callbackUrl: base + '/admin' }) }); collect(staffLogin);
  const adminHeaders = { cookie: staffCookie(), origin: base, 'Content-Type': 'application/json' };
  const inbox = await request(`/api/ads-notifications?orderId=${id}&source=CUSTOMER`, { headers: adminHeaders }); assert.equal(inbox.status, 200); assert.equal((await inbox.json()).items[0].id, item.id);
  assert.equal((await request('/api/ads-notifications', { method: 'PATCH', headers: { ...adminHeaders, origin: 'https://evil.test' }, body: JSON.stringify({ id: item.id, action: 'resolve', response: 'Test reply' }) })).status, 403);
  assert.equal((await request('/api/ads-notifications', { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ id: item.id, action: 'resolve', response: 'ตรวจสอบรายการทดสอบแล้ว สัญญาเดิมยังทำงานตามปกติ' }) })).status, 200);
  const customer = await request(`/api/public/account/requests?id=${id}`, { headers }); assert.equal(customer.status, 200); assert.equal((await customer.json()).items[0].status, 'RESOLVED');
  const cancel = { ...input, requestId: randomUUID(), kind: 'CANCELLATION', reason: 'cancel', message: 'ขอยกเลิกบริการทดสอบ กรุณาตรวจสอบเงื่อนไขก่อนดำเนินการ' };
  assert.equal((await request('/api/public/account/requests', { method: 'POST', headers, body: JSON.stringify(cancel) })).status, 201);
  const unchanged = await db.adsOrder.findUniqueOrThrow({ where: { id } }); assert.equal(unchanged.status, 'ACTIVE'); assert.equal(unchanged.endsAt.getTime(), end.getTime());
  console.log('ADS_NOTIFICATIONS_HTTP_OK: authenticated routes, origin, owner, idempotency, staff reply, customer visibility, cancellation leaves contract running');
  if (process.argv.includes('--keep-preview')) { keep = true; writeFileSync('artifacts/notification-ui-fixture.json', JSON.stringify({ id, viewerId, email, password })); console.log(JSON.stringify({ id, email, password })); }
} finally {
  if (!keep) { await db.auditLog.deleteMany({ where: { resourceType: 'ads_order', resourceId: id } }); await db.adsOrder.deleteMany({ where: { id } }); await db.viewerSession.deleteMany({ where: { viewerId } }); await db.viewer.deleteMany({ where: { id: viewerId } }); }
  await db.$disconnect();
}
