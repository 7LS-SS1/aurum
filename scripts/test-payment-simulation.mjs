import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';

const url = new URL(process.env.DATABASE_URL || 'http://invalid');
if (url.hostname !== '127.0.0.1' || url.port !== '55439' || url.pathname !== '/aurum_ads_test') throw Error('Local isolated DB only');
const db = new PrismaClient(), base = 'http://localhost:3007';
const ids = [], viewers = [], files = [];
const password = 'Payment-demo-only-2026';
let keep = false;
const json = async (response, status = 200) => { assert.equal(response.status, status, await response.clone().text()); return response.json(); };
try {
  async function signup() {
    const email = `sim-${randomUUID()}@example.test`;
    const response = await fetch(base + '/api/public/auth/register', { method: 'POST', headers: { origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, displayName: 'ลูกค้าทดสอบชำระเงิน' }) });
    const data = await json(response, 201); viewers.push(data.viewer.id);
    return { email, id: data.viewer.id, cookie: response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ') };
  }
  const buyer = await signup(), other = await signup();
  const jar = new Map();
  const collect = r => r.headers.getSetCookie().forEach(c => { const [k, ...v] = c.split(';')[0].split('='); jar.set(k, v.join('=')); });
  const cookie = () => [...jar].map(([k, v]) => k + '=' + v).join('; ');
  const csrf = await fetch(base + '/api/auth/csrf'); collect(csrf);
  const { csrfToken } = await csrf.json();
  const login = await fetch(base + '/api/auth/callback/credentials', { method: 'POST', redirect: 'manual', headers: { cookie: cookie(), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: 'ads-manager@example.test', password: 'Local-services-test-only-2026', csrfToken, callbackUrl: base + '/admin' }) }); collect(login);
  const site = (await db.servicePageConfig.findUniqueOrThrow({ where: { id: 'ads-banner' } })).config.websites.find(s => s.enabled);
  assert.ok(site, 'Need an enabled local website');
  const availability = await json(await fetch(base + '/api/public/ads-orders?websiteId=' + site.id));
  const slot = ['L1', 'R1', 'L2', 'R2', 'L3', 'R3', 'L4', 'R4'].map(s => 'home_top:' + s).find(s => !availability.occupied.includes(s));
  assert.ok(slot, 'Need a free test slot');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWMInXk3dOZdBggFADAiBy1VU9MRAAAAAElFTkSuQmCC', 'base64');
  const file = await json(await fetch(base + '/api/public/ads-attachments', { method: 'POST', headers: { cookie: buyer.cookie, origin: base, 'Content-Type': 'image/png', 'X-File-Name': encodeURIComponent('ป้ายจำลอง.png') }, body: png })); files.push(file.id);
  // A live-mode fixture must not collide with the isolated simulation inventory.
  const realId = randomUUID(); ids.push(realId);
  await db.adsOrder.create({ data: { id: realId, requestId: randomUUID(), tokenHash: randomUUID(), requestHash: randomUUID(), customer: {}, quote: { website: site, items: [] }, slots: [slot], status: 'PAID', amount: 1500, days: 30, artworkUrl: '', targetUrl: '' } });
  const token = randomBytes(32).toString('hex');
  const input = { websiteId: site.id, requestId: randomUUID(), kind: 'slots', slots: [slot], days: 90, expectedAmount: 4500, name: 'ลูกค้าทดสอบชำระเงิน', email: buyer.email, contact: '@simulation', targetUrl: 'https://brand.example.test', attachments: [{ slot, fileId: file.id, targetUrl: 'https://brand.example.test' }], note: 'Simulation integration fixture', acceptedTerms: true };
  const create = body => fetch(base + '/api/public/ads-orders', { method: 'POST', headers: { cookie: buyer.cookie, origin: base, 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
  let order = (await json(await create(input), 201)).order; ids.push(order.id);
  const detailUrl = base + '/api/ads-orders/' + order.id;
  await json(await fetch(detailUrl), 401);
  await json(await fetch(detailUrl, { headers: { cookie: buyer.cookie } }), 401);
  await json(await fetch(base + '/api/ads-orders/' + randomUUID(), { headers: { cookie: cookie() } }), 404);
  await json(await fetch(base + '/api/ads-orders/not-an-id', { headers: { cookie: cookie() } }), 422);
  const detail = await json(await fetch(detailUrl, { headers: { cookie: cookie() } }));
  assert.equal(detail.order.id, order.id);
  assert.ok(!('tokenHash' in detail.order) && !('requestId' in detail.order) && !('requestHash' in detail.order));
  assert.ok(detail.events.some(e => e.action === 'ads_order_sim_created'));
  assert.ok((await fetch(detailUrl, { headers: { cookie: cookie() } })).headers.get('cache-control').includes('no-store'));
  assert.equal(order.status, 'PAYMENT'); assert.equal(order.simulation.phase, 'checkout'); assert.equal(order.paymentUrl, null); assert.equal(order.startsAt, null);
  assert.equal((await json(await create(input), 201)).order.id, order.id, 'Create retry must be idempotent');
  assert.equal(await db.adsNotification.count({ where: { orderId: order.id, kind: 'NEW_ORDER' } }), 1, 'Create retry must not duplicate staff alerts');
  const competitor = { ...input, requestId: randomUUID() };
  await json(await create(competitor), 409);
  const endpoint = base + '/api/public/ads-orders/simulation';
  const read = async () => (await json(await fetch(endpoint + '?id=' + order.id, { headers: { cookie: buyer.cookie } }))).order;
  const post = (body, headers = {}) => fetch(endpoint, { method: 'POST', headers: { cookie: buyer.cookie, origin: base, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ id: order.id, revision: order.revision, ...body }) });
  const admin = (action, revision = order.revision) => fetch(base + '/api/ads-orders', { method: 'PUT', headers: { cookie: cookie(), origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: order.id, revision, action, note: 'บันทึกความคืบหน้าทดสอบ ' + action }) });
  await json(await fetch(endpoint + '?id=' + order.id), 401);
  await json(await fetch(endpoint + '?id=' + order.id, { headers: { cookie: other.cookie } }), 404);
  await json(await post({ action: 'select', method: 'qr' }, { origin: 'https://evil.example.test' }), 403);
  await json(await post({ action: 'select', method: 'qr' }, { cookie: other.cookie }), 404);
  await json(await post({ action: 'select', method: 'usdt_bep28' }), 422);
  await json(await post({ action: 'select', method: 'qr', amount: 1 }), 422);
  await json(await admin('confirm_payment'), 409);
  await json(await admin('sim_activate'), 409);
  for (const method of ['usdt_bep20', 'usdt_trc20', 'qr']) order = (await json(await post({ action: 'select', method }))).order;
  order = (await json(await post({ action: 'submit', outcome: 'failed' }))).order;
  assert.equal(order.simulation.phase, 'checkout'); assert.equal(order.status, 'PAYMENT');
  order = (await json(await post({ action: 'submit', outcome: 'mismatch' }))).order;
  assert.equal(order.simulation.phase, 'submitted');
  assert.equal(await db.adsNotification.count({ where: { orderId: order.id, kind: 'PAYMENT_ISSUE' } }), 2, 'Failed and mismatched payments notify staff');
  await json(await admin('sim_verify'), 409);
  await json(await admin('sim_retry')); order = await read();
  assert.equal(order.simulation.phase, 'checkout');
  const staleRevision = order.revision;
  order = (await json(await post({ action: 'submit', outcome: 'success' }))).order;
  await json(await admin('sim_verify', staleRevision), 409);
  const double = await Promise.all([admin('sim_verify'), admin('sim_verify')]);
  assert.deepEqual(double.map(r => r.status).sort(), [200, 409]);
  order = await read(); assert.equal(order.status, 'PAID'); assert.equal(order.startsAt, null);
  await json(await admin('sim_activate'), 409);
  for (const [action, phase] of [['sim_install', 'installing'], ['sim_update', 'installing'], ['sim_review', 'approval']]) {
    await json(await admin(action)); order = await read(); assert.equal(order.simulation.phase, phase); assert.equal(order.startsAt, null);
  }
  await json(await admin('sim_activate')); order = await read();
  const activeDetail = await json(await fetch(detailUrl, { headers: { cookie: cookie() } }));
  assert.equal(activeDetail.order.status, 'ACTIVE');
  for (const action of ['sim_verify', 'sim_install', 'sim_review', 'sim_activate']) assert.ok(activeDetail.events.some(e => e.action === 'ads_order_' + action));
  assert.equal(order.status, 'ACTIVE'); assert.equal(new Date(order.endsAt) - new Date(order.startsAt), 90 * 86400000);
  await json(await admin('sim_activate'), 409);
  const history = await json(await fetch(base + '/api/public/account/order-history?id=' + order.id, { headers: { cookie: buyer.cookie } }));
  assert.ok(history.events.some(e => e.action === 'ads_order_sim_verify')); assert.ok(history.events.some(e => e.action === 'ads_order_sim_update')); assert.ok(history.events.every(e => !('reference' in e)));
  const account = await json(await fetch(base + '/api/public/account/orders', { headers: { cookie: buyer.cookie } })); assert.ok(account.orders.some(o => o.id === order.id && o.simulation));
  const adminList = await json(await fetch(base + '/api/ads-orders?q=' + order.id, { headers: { cookie: cookie() } })); assert.equal(adminList.simulationEnabled, true); assert.equal(adminList.paymentReady, false);
  await json(await admin('sim_cancel')); order = await read(); assert.equal(order.status, 'REJECTED');
  // Only this test-owned order is rewound to exercise a timeout, never user data.
  await db.adsOrder.update({ where: { id: order.id }, data: { status: 'PAYMENT', startsAt: null, endsAt: null, paymentReference: null, holdUntil: new Date(Date.now() - 1000), quote: { ...order.quote, simulation: { ...order.simulation, phase: 'checkout', receipt: null } } } });
  order = await read(); assert.equal(order.status, 'EXPIRED');
  await json(await post({ action: 'submit', outcome: 'success' }), 409);
  await json(await admin('sim_verify'), 409);
  // Check that the live-mode record has not been changed by simulation actions.
  assert.equal((await db.adsOrder.findUniqueOrThrow({ where: { id: realId } })).status, 'PAID');
  console.log('PAYMENT_SIMULATION_OK: QR + both USDT methods, real file upload, owner/CSRF validation, isolated inventory, idempotent create, failed/mismatched receipts, concurrent verification, install/approve clock, member history, expiry; no gateway calls');
  if (process.argv.includes('--keep-demo')) {
    await db.auditLog.deleteMany({ where: { resourceType: 'ads_order', resourceId: order.id } });
    await db.adsOrder.update({ where: { id: order.id }, data: { status: 'PAYMENT', staffNote: '', holdUntil: new Date(Date.now() + 30 * 60000), quote: { ...order.quote, simulation: { ...order.simulation, phase: 'checkout', method: null, receipt: null } } } });
    ids.splice(ids.indexOf(order.id), 1); viewers.splice(viewers.indexOf(buyer.id), 1); files.splice(files.indexOf(file.id), 1); keep = true;
    console.log(JSON.stringify({ demoUrl: base + '/services/ads-banner/checkout/' + order.id, email: buyer.email, password }));
  }
} finally {
  await db.auditLog.deleteMany({ where: { resourceType: 'ads_order', resourceId: { in: ids } } });
  await db.adsOrder.deleteMany({ where: { id: { in: ids } } });
  await db.viewerSession.deleteMany({ where: { viewerId: { in: viewers } } });
  await db.viewer.deleteMany({ where: { id: { in: viewers } } });
  for (const id of files) for (const ext of ['json', 'bin']) await unlink(new URL(`../.local-ads-uploads/${id}.${ext}`, import.meta.url)).catch(() => {});
  await db.$disconnect();
  if (keep) console.log('Kept one clearly labelled demo order for browser testing. All other owned fixtures removed.');
}
