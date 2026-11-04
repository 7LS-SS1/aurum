// Run ONLY against the disposable local service-page test database/server.
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const dbUrl = new URL(process.env.DATABASE_URL || "http://invalid");
if (!["localhost", "127.0.0.1"].includes(dbUrl.hostname) || dbUrl.pathname !== "/aurum_services_test") throw new Error("Disposable local test database required");
const base = "http://localhost:3007";
const prisma = new PrismaClient();
async function login(role) {
  const email = `services-${role.toLowerCase()}@example.test`;
  const password = "Local-services-test-only-2026";
  await prisma.user.upsert({ where: { email }, update: { role }, create: { email, role, name: `Services ${role}`, passwordHash: await bcrypt.hash(password, 10) } });
  const jar = new Map();
  const collect = response => response.headers.getSetCookie().forEach(raw => { const pair = raw.split(";")[0]; const i = pair.indexOf("="); jar.set(pair.slice(0, i), pair.slice(i + 1)); });
  const cookies = () => [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
  const csrf = await fetch(`${base}/api/auth/csrf`); collect(csrf);
  const { csrfToken } = await csrf.json();
  const response = await fetch(`${base}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded", cookie: cookies() }, body: new URLSearchParams({ email, password, csrfToken, callbackUrl: `${base}/admin/services` }) });
  collect(response);
  return cookies();
}
try {
  if (process.env.SERVICE_TEST_PRE_MIGRATION === "1") {
    const cookie = await login("MANAGER");
    const current = await (await fetch(`${base}/api/services`, { headers: { cookie } })).json();
    assert.equal(current.ready, false);
    assert.equal((await fetch(`${base}/services`)).status, 200);
    const save = await fetch(`${base}/api/services`, { method: "PUT", headers: { cookie, origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ config: current.config, revision: 0 }) });
    assert.equal(save.status, 503);
    console.log("SERVICE_PAGE_PRE_MIGRATION_OK: old public page retained, admin not ready, writes rejected");
  } else {
  // This script is restricted above to the disposable test database.
  await prisma.servicePageConfig.deleteMany({ where: { id: "default" } });
  const previousAuditCount = await prisma.auditLog.count({ where: { action: "update_service_page" } });
  const manager = await login("MANAGER"), staff = await login("STAFF");
  const request = (cookie, method = "GET", body, origin = base) => fetch(`${base}/api/services`, { method, headers: { cookie, origin, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await fetch(`${base}/api/services`)).status, 401);
  assert.equal((await request(staff)).status, 403);
  const initial = await (await request(manager)).json();
  const config = structuredClone(initial.config);
  config.plans[0].monthly = 7777; config.contractMonths = 6;
  const payload = { config, revision: initial.revision };
  assert.equal((await request(staff, "PUT", payload)).status, 403);
  assert.equal((await request(manager, "PUT", payload, "https://other.example")).status, 403);
  assert.equal((await request(manager, "PUT", { ...payload, config: { ...config, hosting: -1 } })).status, 422);
  const races = await Promise.all([request(manager, "PUT", payload), request(manager, "PUT", payload)]);
  assert.deepEqual(races.map(r => r.status).sort(), [200, 409]);
  const saved = await (await request(manager)).json();
  assert.equal(saved.config.plans[0].monthly, 7777);
  assert.equal(saved.revision, initial.revision + 1);
  const publicResponse = await fetch(`${base}/services`);
  assert.equal(publicResponse.status, 200);
  const html = await publicResponse.text();
  assert.ok(html.includes("8,367"));
  assert.ok(html.includes("สัญญาขั้นต่ำ 6 เดือน"));
  const admin = await fetch(`${base}/admin/services`, { headers: { cookie: manager } });
  assert.equal(admin.status, 200); assert.ok((await admin.text()).includes("บันทึกและเผยแพร่"));
  const denied = await fetch(`${base}/admin/services`, { headers: { cookie: staff } });
  assert.ok((await denied.text()).includes("ไม่มีสิทธิ์จัดการหน้าบริการ"));
  assert.equal(await prisma.auditLog.count({ where: { action: "update_service_page" } }), previousAuditCount + 1);
  assert.equal((await request(manager, "PUT", { config: initial.config, revision: saved.revision })).status, 200);
  console.log("SERVICE_PAGE_HTTP_OK: credentials login, role/origin validation, concurrent save, persistence, public rendering, admin rendering, audit and restore");
  }
} finally { await prisma.$disconnect(); }
