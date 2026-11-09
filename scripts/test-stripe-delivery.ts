import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

async function main() {
  const serve = process.argv.includes("--serve");
  const dev = serve && process.argv.includes("--dev");
  const recovery = process.argv.includes("--recovery");
  assert.ok(!recovery || !serve, "Recovery test cannot run as a preview");
  const url = new URL(process.env.DATABASE_URL || "http://invalid");
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55441"); assert.equal(url.pathname, recovery ? "/aurum_stripe_recovery_test" : "/aurum_stripe_test");
  loadEnvConfig(process.cwd());
  assert.match(process.env.STRIPE_SECRET_KEY || "", /^(rk|sk)_test_/);
  Object.assign(process.env, { STRIPE_ENABLED: "true", STRIPE_ENVIRONMENT: "sandbox", STRIPE_SANDBOX_DB_CONFIRMED: "true", STRIPE_PUBLIC_BASE_URL: "http://localhost:3317", AUTH_URL: "http://localhost:3317", AUTH_SECRET: "local-stripe-delivery-test-secret-only-2026", UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "" });
  Object.assign(process.env, { SERVICE_EMAIL_ENABLED: "false", ADS_PROMPTPAY_MODE: "", STRIPE_RECONCILIATION_ENABLED: recovery ? "true" : "false", SERVICE_WORKER_SECRET: randomUUID() + randomUUID(), SERVICE_WORKER_ORIGIN: "http://localhost:3317" });
  const children: ChildProcess[] = [];
  const { prisma } = await import("../src/lib/prisma");
  const { stripeClient, stripeAccountCheck } = await import("../src/lib/stripe-config");
  const { createStripeDraft, prepareStripePayment } = await import("../src/lib/stripe-orders");
  const { client, settings } = stripeClient();
  await stripeAccountCheck(client, settings.accountId);
  let remoteId: string | null = null;
  try {
    if (recovery) {
      assert.equal(await prisma.stripeOrder.count(), 0, "Recovery fixture needs a fresh isolated database");
      assert.equal(await prisma.adsOrder.count(), 0, "Recovery fixture must not process existing Banner orders");
    }
    // Secret is captured in memory and passed only through the child's environment.
    const shim = process.env.STRIPE_CLI_SHIM || path.join(process.env.APPDATA || "", "npm/node_modules/@stripe/cli/bin/shim.js");
    const events = serve ? "payment_intent.succeeded,checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,invoice.finalized,invoice.paid,invoice.payment_failed,invoice.voided,invoice.marked_uncollectible,credit_note.created,charge.refunded,charge.dispute.created,refund.updated,refund.failed" : "invoice.finalized,invoice.voided";
    const listener = spawn(process.execPath, [shim, "listen", "--skip-update", "--latest", "--events-from", "@self", "--events", events, "--forward-to", "http://localhost:3317/api/public/payments/stripe/webhook"], { windowsHide: true, env: { ...process.env, STRIPE_API_KEY: settings.key }, stdio: ["ignore", "pipe", "pipe"] });
    children.push(listener);
    const secret = await new Promise<string>((resolve, reject) => {
      let output = "";
      const timeout = setTimeout(() => reject(Error("Stripe listener did not become ready")), 45000);
      const consume = (chunk: Buffer) => {
        output = (output + chunk.toString()).slice(-6000);
        const match = output.match(/whsec_[A-Za-z0-9]+/);
        if (match) { clearTimeout(timeout); resolve(match[0]); output = ""; }
      };
      listener.stdout!.on("data", consume); listener.stderr!.on("data", consume);
      listener.once("error", () => { clearTimeout(timeout); reject(Error("Cannot start Stripe listener")); });
      listener.once("exit", code => { clearTimeout(timeout); reject(Error(`Stripe listener exited ${code}`)); });
    });
    const serverArgs = dev ? ["node_modules/next/dist/bin/next", "dev", "--turbopack", "--port", "3317", "--hostname", "127.0.0.1"] : [".next/standalone/server.js"];
    const server = spawn(process.execPath, serverArgs, { windowsHide: true, env: { ...process.env, NODE_ENV: dev ? "development" : "production", PORT: "3317", HOSTNAME: "127.0.0.1", STRIPE_WEBHOOK_SECRET: secret }, stdio: ["ignore", "pipe", "pipe"] });
    children.push(server); server.stdout!.resume(); server.stderr!.resume();
    let ready = false;
    for (let i = 0; i < (dev ? 120 : 40); i++) {
      try { ready = (await fetch("http://127.0.0.1:3317/api/public/payments/stripe")).status === 401; } catch { /* starting */ }
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(ready, "Local app did not start");
    console.log("PASS Stripe listener and local app ready; signing secret kept private");
    if (serve) {
      console.log("SANDBOX_PREVIEW_READY http://localhost:3317/admin/payments");
      await new Promise<void>(resolve => {
        process.once("SIGINT", resolve);
        process.once("SIGTERM", resolve);
        listener.once("exit", resolve);
        server.once("exit", resolve);
      });
      return;
    }
    const viewer = await prisma.viewer.create({ data: { email: `delivery-${randomUUID()}@example.test`, displayName: "Sandbox Webhook Test" } });
    const order = await createStripeDraft({ kind: "VIDEO", requestId: randomUUID(), viewerId: viewer.id, title: "AURUM Sandbox webhook delivery test", amountSatang: 10000, mode: "INVOICE" }, { id: null, role: "HEAD" });
    await prepareStripePayment(order.id);
    const row = await prisma.stripeOrder.findUniqueOrThrow({ where: { id: order.id } }); remoteId = row.remoteId;
    assert.equal(row.status, "CREATING");
    // Finalize outside AURUM: only the externally delivered webhook can update this local row.
    await client.invoices.finalizeInvoice(remoteId!, { auto_advance: false });
    async function waitFor(status: string) {
      for (let i = 0; i < 90; i++) {
        const fresh = await prisma.stripeOrder.findUniqueOrThrow({ where: { id: order.id } });
        if (fresh.status === status) return;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      throw Error(`Webhook did not produce ${status}`);
    }
    await waitFor("OPEN");
    console.log("PASS Stripe invoice.finalized delivered through CLI, signature verified, local order OPEN");
    await client.invoices.voidInvoice(remoteId!);
    await waitFor("VOID");
    console.log("STRIPE_REAL_WEBHOOK_DELIVERY_OK invoice.finalized and invoice.voided on production build");
    if (recovery) {
      // Stop forwarding first: the next invoice can only be recovered by the scheduler.
      assert.ok(listener.pid);
      if (process.platform === "win32") assert.equal(spawnSync("taskkill", ["/pid", String(listener.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }).status, 0);
      else { listener.kill("SIGTERM"); await new Promise<void>(resolve => listener.once("exit", () => resolve())); }
      const missed = await createStripeDraft({ kind: "VIDEO", requestId: randomUUID(), viewerId: viewer.id, title: "AURUM Sandbox missed webhook recovery", amountSatang: 10000, mode: "INVOICE" }, { id: null, role: "HEAD" });
      await prepareStripePayment(missed.id);
      remoteId = (await prisma.stripeOrder.findUniqueOrThrow({ where: { id: missed.id } })).remoteId;
      await client.invoices.finalizeInvoice(remoteId!, { auto_advance: false });
      assert.equal((await prisma.stripeOrder.findUniqueOrThrow({ where: { id: missed.id } })).status, "CREATING");
      const workerUrl = "http://localhost:3317/api/internal/service-worker";
      assert.equal((await fetch(workerUrl, { method: "POST" })).status, 401);
      assert.equal((await fetch(workerUrl, { method: "POST", headers: { authorization: "Bearer invalid" } })).status, 401);
      async function scheduleOnce() {
        const worker = spawn(process.execPath, ["scripts/service-worker.mjs"], { windowsHide: true, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
        children.push(worker);
        worker.stdout!.resume(); worker.stderr!.resume();
        const code = await new Promise<number | null>((resolve, reject) => { worker.once("error", reject); worker.once("exit", resolve); });
        assert.equal(code, 0, "Scheduler invocation failed");
        const run = await prisma.serviceWorkerRun.findFirstOrThrow({ orderBy: { startedAt: "desc" } });
        assert.equal(run.status, "SUCCEEDED");
        const result = (run.details as { stripe: { enabled: boolean; checked: number; failed: number; cursor: string } }).stripe;
        assert.equal(result.enabled, true); assert.equal(result.checked, 1); assert.equal(result.failed, 0); assert.equal(result.cursor, missed.id);
      }
      await scheduleOnce();
      assert.equal((await prisma.stripeOrder.findUniqueOrThrow({ where: { id: missed.id } })).status, "OPEN");
      console.log("PASS scheduler authentication, missed webhook recovery and persisted cursor on production build");
      await prisma.stripeOrder.update({ where: { id: missed.id }, data: { expiresAt: new Date(Date.now() - 60000) } });
      await scheduleOnce();
      assert.equal((await client.invoices.retrieve(remoteId!)).status, "void");
      assert.equal((await prisma.stripeOrder.findUniqueOrThrow({ where: { id: missed.id } })).status, "VOID");
      assert.equal(await prisma.stripeOrder.count(), 2);
      console.log("STRIPE_PRODUCTION_RECOVERY_OK missed events, cursor wrap, overdue invoice void and no duplicate order");
    }
  } finally {
    if (remoteId) {
      try { const invoice = await client.invoices.retrieve(remoteId); if (invoice.status === "open") await client.invoices.voidInvoice(remoteId); }
      catch { console.log("Sandbox invoice cleanup needs review"); }
    }
    for (const child of children.reverse()) {
      if (child.pid && child.exitCode === null) {
        if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        else child.kill("SIGTERM");
      }
    }
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error("STRIPE_DELIVERY_TEST_FAILED", error?.name, error?.code || error?.message?.slice(0, 150)); process.exitCode = 1; });
