import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const url = new URL(process.env.DATABASE_URL || 'http://invalid');
if (url.hostname !== '127.0.0.1' || url.port !== '55439' || url.pathname !== '/aurum_ads_test') throw Error('Isolated local DB only');
const db = new PrismaClient(), base = 'http://localhost:3007', viewerId = randomUUID(), id = randomUUID();
const email = `promptpay-http-${viewerId}@example.test`, password = randomUUID() + 'Aa1!';
const request = (path, options = {}) => fetch(base + path, { ...options, signal: AbortSignal.timeout(90000) });
try {
  await db.viewer.create({ data: { id: viewerId, email, displayName: 'PromptPay HTTP test', passwordHash: await bcrypt.hash(password, 12) } });
  await db.adsOrder.create({ data: { id, viewerId, requestId: randomUUID(), requestHash: randomUUID(), tokenHash: randomUUID(), customer: { name: 'HTTP test', email, contact: '@test' }, quote: { items: ['HTTP test'] }, slots: [], amount: 1500, days: 30, artworkUrl: '', targetUrl: '' } });
  const path = `/api/public/payments/promptpay?id=${id}`;
  assert.equal((await request(path)).status, 401);
  const login = await request('/api/public/auth/login', { method: 'POST', headers: { origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  assert.equal(login.status, 200, await login.clone().text());
  const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const headers = { cookie, origin: base, 'Content-Type': 'application/json' };
  const response = await request(path, { headers });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ready, false, 'Run against the default-disabled local server only');
  assert.equal(data.order.status, 'REVIEW');
  assert.equal(data.order.promptpay, null);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal((await request('/api/public/payments/promptpay?id=' + randomUUID(), { headers })).status, 404);
  assert.equal((await request('/api/public/payments/promptpay', { method: 'POST', headers: { ...headers, origin: 'https://evil.test' }, body: JSON.stringify({ id, action: 'create' }) })).status, 403);
  assert.equal((await request('/api/public/payments/promptpay', { method: 'POST', headers, body: JSON.stringify({ id, action: 'create', amount: 1 }) })).status, 422);
  assert.equal((await request('/api/public/payments/promptpay', { method: 'POST', headers, body: JSON.stringify({ id, action: 'create' }) })).status, 503);
  const page = await request(`/services/ads-banner/checkout/${id}`, { headers });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /QR PromptPay/);
  assert.equal((await db.adsOrder.findUniqueOrThrow({ where: { id } })).status, 'REVIEW');
  console.log('PROMPTPAY_HTTP_OK: auth, ownership, CSRF, strict body, disabled gateway, authenticated checkout, no charge/status mutation');
} finally {
  await db.auditLog.deleteMany({ where: { resourceType: 'ads_order', resourceId: id } });
  await db.adsOrder.deleteMany({ where: { id } });
  await db.viewerSession.deleteMany({ where: { viewerId } });
  await db.viewer.deleteMany({ where: { id: viewerId } });
  await db.$disconnect();
}
