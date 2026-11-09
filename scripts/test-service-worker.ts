import assert from "node:assert/strict";
async function main() {
  const target = new URL(process.env.DATABASE_URL || "http://invalid");
  if (target.hostname !== "127.0.0.1" || target.port !== "55439" || target.pathname !== "/aurum_worker_ops_test") throw Error("Dedicated empty worker test database only");
  process.env.SERVICE_EMAIL_ENABLED = "false";
  process.env.ADS_PROMPTPAY_MODE = "";
  process.env.TWOC2P_MERCHANT_ID = "";
  process.env.TWOC2P_SECRET_KEY = "";
  const { prisma } = await import("../src/lib/prisma");
  const { runServiceWorker } = await import("../src/lib/service-worker");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw Error("External calls forbidden in this test"); };
  try {
    assert.equal(await prisma.adsOrder.count(), 0, "No existing orders may be processed by this fixture");
    const result = await runServiceWorker();
    assert.equal(result.paymentChecked, 0);
    assert.equal(result.paymentFailures, 0);
    const last = await prisma.serviceWorkerRun.findFirstOrThrow({ orderBy: { startedAt: "desc" } });
    assert.equal(last.status, "SUCCEEDED");
    assert.ok(last.finishedAt);
    const lease = await prisma.serviceWorkerRun.create({ data: { status: "RUNNING", details: {} } });
    try { await assert.rejects(runServiceWorker(), /worker_running/); }
    finally { await prisma.serviceWorkerRun.update({ where: { id: lease.id }, data: { status: "INTERRUPTED", finishedAt: new Date() } }); }
    console.log("SERVICE_WORKER_LOCAL_OK: complete run, database heartbeat, overlapping lease rejected, all external providers disabled; dedicated empty database");
  } finally { globalThis.fetch = originalFetch; await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
