// Run ONLY against the disposable local service-page test database/server.
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "node:crypto";

const dbUrl = new URL(process.env.DATABASE_URL || "http://invalid");
if (!["localhost", "127.0.0.1"].includes(dbUrl.hostname) || dbUrl.pathname !== "/aurum_ads_test") throw new Error("Disposable local test database required");
const base = "http://localhost:3007";
const prisma = new PrismaClient();
async function login(role) {
  const email = `ads-${role.toLowerCase()}@example.test`;
  const password = "Local-services-test-only-2026";
  await prisma.user.upsert({ where: { email }, update: { role }, create: { email, role, name: `Services ${role}`, passwordHash: await bcrypt.hash(password, 10) } });
  const jar = new Map();
  const collect = response => response.headers.getSetCookie().forEach(raw => { const pair = raw.split(";")[0]; const i = pair.indexOf("="); jar.set(pair.slice(0, i), pair.slice(i + 1)); });
  const cookies = () => [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
  const csrf = await fetch(`${base}/api/auth/csrf`); collect(csrf);
  const { csrfToken } = await csrf.json();
  const response = await fetch(`${base}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded", cookie: cookies() }, body: new URLSearchParams({ email, password, csrfToken, callbackUrl: `${base}/admin/ads-orders` }) });
  collect(response);
  return cookies();
}
try {
  // The URL guard above restricts cleanup to this disposable fixture database.
  await prisma.adsOrder.deleteMany();
  const manager = await login("MANAGER"), staff = await login("STAFF");
  const signup = await fetch(base + "/api/public/auth/register", {method:"POST", headers:{origin:base,"Content-Type":"application/json"},body:JSON.stringify({email:randomUUID()+"@example.test",password:"Local-member-test-2026",displayName:"Member Test"})});
  assert.equal(signup.status,201); const memberCookie=signup.headers.getSetCookie().map(v=>v.split(";")[0]).join("; ");
  const admin = (method = "GET", body, cookie = manager, origin = base) => fetch(base + "/api/ads-orders", {
    method, headers: { cookie, origin, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal((await fetch(base + "/api/ads-orders")).status, 401);
  assert.equal((await admin("GET", undefined, staff)).status, 403);
  async function create(slot) {
    const token = randomBytes(32).toString("hex");
    const websiteId=(await prisma.servicePageConfig.findUniqueOrThrow({where:{id:'ads-banner'}})).config.websites.find(s=>s.enabled).id;
    const input = { websiteId, requestId: randomUUID(), kind: "slots", slots: [slot], days: 30, expectedAmount: 1500,
      name: "Local test", email: randomUUID() + "@example.test", contact: "@test",
      artworkUrl: "https://example.test/art.png", targetUrl: "https://example.test", note: "", acceptedTerms: true };
    const post = () => fetch(base + "/api/public/ads-orders", { method: "POST", headers: { cookie: memberCookie, origin: base, Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const response = await post();
    assert.equal(response.status, 201, await response.clone().text());
    const { order } = await response.json();
    assert.equal(order.status, "REVIEW");
    assert.equal(order.startsAt, null);
    return { order, token, post };
  }
  const slot = "home_top:L1";
  const a = await create(slot), b = await create(slot);
  const retry = await a.post();
  assert.equal(retry.status, 201);
  assert.equal((await retry.json()).order.id, a.order.id);
  const approve = order => ({ id: order.id, revision: 1, action: "approve", note: "เปิดชำระเงิน", paymentUrl: "https://checkout.example.test/" + order.id });
  assert.equal((await admin("PUT", approve(a.order), manager, "https://wrong.example")).status, 403);
  const race = await Promise.all([admin("PUT", approve(a.order)), admin("PUT", approve(b.order))]);
  assert.deepEqual(race.map(r => r.status).sort(), [200, 409]);
  const winner = race[0].status === 200 ? a : b;
  const loser = winner === a ? b : a;
  const read = async customer => (await (await fetch(base + "/api/public/ads-orders", { headers: { cookie: memberCookie, Authorization: "Bearer " + customer.token } })).json()).order;
  assert.equal((await read(winner)).status, "PAYMENT");
  assert.equal((await read(loser)).status, "REVIEW");
  const occupied = await (await fetch(base + "/api/public/ads-orders")).json();
  assert.ok(occupied.occupied.includes(slot));
  assert.equal(JSON.stringify(occupied).includes("@example.test"), false);
  assert.equal((await admin("PUT", { id: winner.order.id, revision: 2, action: "activate", note: "premature" })).status, 409);
  assert.equal((await admin("PUT", { id: winner.order.id, revision: 2, action: "confirm_payment", note: "wrong amount", reference: "wrong-" + randomUUID(), amount: 1 })).status, 409);
  assert.equal((await admin("PUT", { id: winner.order.id, revision: 2, action: "confirm_payment", note: "ตรวจยอดทดสอบแล้ว", reference: "paid-" + randomUUID(), amount: 1500 })).status, 200);
  assert.equal((await read(winner)).startsAt, null);
  assert.equal((await admin("PUT", { id: winner.order.id, revision: 2, action: "activate", note: "stale" })).status, 409);
  assert.equal((await admin("PUT", { id: winner.order.id, revision: 3, action: "activate", note: "ติดตั้งแล้ว รายงานผลให้ลูกค้า" })).status, 200);
  const active = await read(winner);
  assert.equal(active.status, "ACTIVE");
  assert.equal(new Date(active.endsAt) - new Date(active.startsAt), 30 * 86400000);
  assert.equal(active.staffNote, "ติดตั้งแล้ว รายงานผลให้ลูกค้า");
  assert.equal(active.paymentUrl, null);
  await prisma.adsOrder.update({ where: { id: winner.order.id }, data: { endsAt: new Date(Date.now() - 1000) } });
  assert.equal((await read(winner)).status, "REMOVAL_REQUIRED");
  assert.ok((await (await fetch(base + "/api/public/ads-orders")).json()).occupied.includes(slot));
  assert.equal((await admin("PUT", { id: winner.order.id, revision: 5, action: "confirm_removed", note: "นำป้ายทดสอบออกแล้ว" })).status, 200);
  assert.equal((await read(winner)).status, "COMPLETED");
  const late = await create("home_top:R4");
  assert.equal((await admin("PUT", approve(late.order))).status, 200);
  // Expire only our fixture in the guarded disposable database.
  await prisma.adsOrder.update({ where: { id: late.order.id }, data: { holdUntil: new Date(Date.now() - 1000) } });
  assert.equal((await read(late)).status, "EXPIRED");
  assert.equal((await admin("PUT", { id: late.order.id, revision: 3, action: "confirm_payment", note: "late payment", reference: "late-" + randomUUID(), amount: 1500 })).status, 200);
  assert.equal((await read(late)).status, "REFUND_REQUIRED");
  assert.equal((await admin("PUT", { id: late.order.id, revision: 4, action: "confirm_refund", note: "คืนเงินทดสอบแล้ว", reference: "refund-" + randomUUID() })).status, 200);
  assert.equal((await read(late)).status, "REFUNDED");
  assert.ok(await prisma.auditLog.count({ where: { resourceType: "ads_order", resourceId: winner.order.id } }) >= 3);
  assert.equal((await fetch(base + "/services/ads-banner/book", {headers:{cookie:memberCookie}})).status, 200);
  assert.equal((await fetch(base + "/admin/ads-orders", { headers: { cookie: manager } })).status, 200);
  console.log("ADS_ORDERS_HTTP_OK: auth, origin, idempotency, inventory race, payment reconciliation, approval clock, late payment/refund, customer reporting and audit");
} finally { await prisma.$disconnect(); }
