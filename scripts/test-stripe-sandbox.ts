import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import type Stripe from "stripe";

async function main() {
  // Refuse every database except this disposable, localhost-only test database.
  const database = new URL(process.env.DATABASE_URL || "http://invalid");
  assert.equal(database.hostname, "127.0.0.1"); assert.equal(database.port, "55441"); assert.equal(database.pathname, "/aurum_stripe_test");
  loadEnvConfig(process.cwd());
  assert.match(process.env.STRIPE_SECRET_KEY || "", /^(rk|sk)_test_/);
  Object.assign(process.env, { STRIPE_ENABLED: "true", STRIPE_ENVIRONMENT: "sandbox", STRIPE_SANDBOX_DB_CONFIRMED: "true", STRIPE_PUBLIC_BASE_URL: "http://localhost:3317" });
  const { prisma } = await import("../src/lib/prisma");
  const billing = await import("../src/lib/stripe-orders");
  const { stripeClient, stripeAccountCheck } = await import("../src/lib/stripe-config");
  const { actOnOrder } = await import("../src/lib/ads-orders");
  const { defaultAdsPage } = await import("../src/lib/ads-page-config");
  const { getInventory } = await import("../src/lib/ads-booking");
  const { client, settings } = stripeClient();
  await stripeAccountCheck(client, settings.accountId);
  if (process.argv.includes("--reconcile-only")) {
    try {
      const existing = await prisma.stripeOrder.findMany({ where: { remoteId: { not: null } }, take: 100 });
      for (const order of existing) await billing.reconcileStripeOrder(order.id);
      console.log("STRIPE_EXISTING_RECONCILIATION_OK", existing.length);
    } finally { await prisma.$disconnect(); }
    return;
  }
  const actor = { id: null, role: "HEAD" as const };
  const rows: string[] = [];
  let fixtureSiteId: string | null = null;
  try {
    const viewer = await prisma.viewer.create({ data: { email: `stripe-${randomUUID()}@example.test`, displayName: "AURUM Sandbox Test" } });
    async function video(mode: "CHECKOUT" | "INVOICE") {
      const input = { kind: "VIDEO" as const, requestId: randomUUID(), viewerId: viewer.id, title: "AURUM sandbox integration test", amountSatang: 10000, mode };
      const row = await billing.createStripeDraft(input, actor); rows.push(row.id);
      assert.equal((await billing.createStripeDraft(input, actor)).id, row.id);
      await assert.rejects(billing.createStripeDraft({ ...input, amountSatang: 20000 }, actor), /request_conflict/);
      return row;
    }
    const checkout = await video("CHECKOUT");
    await assert.rejects(billing.prepareStripePayment(checkout.id, randomUUID()), /not_found/);
    // Concurrent callers share provider idempotency keys and durable local intent.
    const results = await Promise.all([billing.prepareStripePayment(checkout.id, viewer.id), billing.prepareStripePayment(checkout.id, viewer.id)]);
    assert.equal(results[0]!.url, results[1]!.url); assert.equal(results[0]!.status, "OPEN");
    let remote = await prisma.stripeOrder.findUniqueOrThrow({ where: { id: checkout.id } });
    const session = await client.checkout.sessions.retrieve(remote.remoteId!);
    assert.equal(session.livemode, false); assert.equal(session.amount_total, 10000);
    await client.checkout.sessions.expire(session.id);
    assert.equal((await billing.reconcileStripeOrder(checkout.id)).status, "EXPIRED");
    console.log("PASS checkout create, concurrency, ownership, amount, expiry");

    const site = { id: randomUUID(), name: "Sandbox test site", url: "https://example.test", enabled: true };
    fixtureSiteId = site.id;
    const existingPage = await prisma.servicePageConfig.findUnique({ where: { id: "ads-banner" } });
    const originalConfig = existingPage?.config as typeof defaultAdsPage | undefined;
    const config = { ...(originalConfig || defaultAdsPage), websites: [...(originalConfig?.websites || []), site] };
    await prisma.servicePageConfig.upsert({ where: { id: "ads-banner" }, create: { id: "ads-banner", config }, update: { config } });
    const banner = await prisma.adsOrder.create({ data: { id: randomUUID(), viewerId: viewer.id, requestId: randomUUID(), requestHash: randomUUID(), tokenHash: randomUUID(), customer: { name: "Sandbox test" }, quote: { website: site }, slots: [getInventory(config)[0]!.id], amount: 100, days: 30, artworkUrl: "", targetUrl: "" } });
    const invoice = await billing.createStripeDraft({ kind: "BANNER", requestId: randomUUID(), bannerOrderId: banner.id, mode: "INVOICE" }, actor); rows.push(invoice.id);
    let current = await prisma.adsOrder.findUniqueOrThrow({ where: { id: banner.id } });
    await assert.rejects(actOnOrder(banner.id, { action: "confirm_payment", revision: current.revision, note: "Bypass test", amount: 100, reference: "fake" }, actor), /stripe_verification_required/);
    await billing.prepareStripePayment(invoice.id);
    assert.equal((await billing.finalizeStripeInvoice(invoice.id)).status, "OPEN");
    const { reconcileContracts } = await import("../src/lib/ads-renewal-server");
    const held = await prisma.adsOrder.findUniqueOrThrow({ where: { id: banner.id } });
    await prisma.adsOrder.update({ where: { id: banner.id }, data: { holdUntil: new Date(Date.now() - 1000) } });
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73421, 1)`;
      await reconcileContracts(tx, new Date(), [banner.id]);
    }, { maxWait: 10000, timeout: 30000 });
    assert.equal((await prisma.adsOrder.findUniqueOrThrow({ where: { id: banner.id } })).status, "PAYMENT");
    await prisma.adsOrder.update({ where: { id: banner.id }, data: { holdUntil: held.holdUntil } });
    console.log("PASS local deadline cannot release inventory while Stripe invoice is payable");
    remote = await prisma.stripeOrder.findUniqueOrThrow({ where: { id: invoice.id } });
    // Stripe's reusable Sandbox card: no real customer, money or email.
    const method = await client.paymentMethods.attach("pm_card_visa", { customer: remote.customerId! });
    await client.invoices.pay(remote.remoteId!, { payment_method: method.id }, { idempotencyKey: `aurum-test:${invoice.id}:pay` });
    const event = { id: `evt_local_${randomUUID()}`, type: "invoice.paid", livemode: false, data: { object: { id: remote.remoteId!, metadata: { aurumOrderId: invoice.id } } } } as unknown as Stripe.Event;
    await Promise.all([billing.handleStripeEvent(event), billing.handleStripeEvent(event)]);
    assert.equal((await billing.reconcileStripeOrder(invoice.id)).status, "PAID");
    current = await prisma.adsOrder.findUniqueOrThrow({ where: { id: banner.id } });
    assert.equal(current.status, "PAYMENT_REVIEW"); assert.equal(current.startsAt, null);
    await billing.confirmStripeBanner(invoice.id, actor);
    assert.equal((await prisma.adsOrder.findUniqueOrThrow({ where: { id: banner.id } })).status, "PAID");
    assert.equal(await prisma.stripeEvent.count({ where: { id: event.id } }), 1);
    console.log("PASS real Sandbox invoice, test card payment, duplicate event, Banner staff review");
    remote = await prisma.stripeOrder.findUniqueOrThrow({ where: { id: invoice.id } });
    assert.ok(remote.paymentIntentId);
    await client.refunds.create({ payment_intent: remote.paymentIntentId }, { idempotencyKey: `aurum-test:${invoice.id}:refund` });
    assert.equal((await billing.reconcileStripeOrder(invoice.id)).status, "REFUNDED");
    assert.equal((await prisma.adsOrder.findUniqueOrThrow({ where: { id: banner.id } })).status, "REFUND_REQUIRED");
    await assert.rejects(billing.confirmStripeBanner(invoice.id, actor), /stripe_verification_required/);
    await assert.rejects(billing.closeStripeBannerRefund(invoice.id, actor, false), /stripe_removal_confirmation_required/);
    await billing.closeStripeBannerRefund(invoice.id, actor, true);
    assert.equal((await prisma.adsOrder.findUniqueOrThrow({ where: { id: banner.id } })).status, "REFUNDED");
    console.log("PASS refunded payment cannot start Banner service");

    const manual = await video("INVOICE");
    await billing.prepareStripePayment(manual.id); await billing.finalizeStripeInvoice(manual.id);
    remote = await prisma.stripeOrder.findUniqueOrThrow({ where: { id: manual.id } });
    await client.invoices.pay(remote.remoteId!, { paid_out_of_band: true });
    assert.equal((await billing.reconcileStripeOrder(manual.id)).status, "REVIEW");
    assert.equal((await prisma.stripeOrder.findUniqueOrThrow({ where: { id: manual.id } })).paidAt, null);
    console.log("PASS manually marked-paid invoice is not proof of payment");
    const overdue = await video("INVOICE");
    await billing.prepareStripePayment(overdue.id); await billing.finalizeStripeInvoice(overdue.id);
    await prisma.stripeOrder.update({ where: { id: overdue.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await billing.reconcileStripeOrder(overdue.id)).status, "VOID");
    console.log("PASS overdue invoice voided at Stripe and persisted locally");
    console.log("STRIPE_SANDBOX_INTEGRATION_OK");
  } finally {
    if (fixtureSiteId) {
      const page = await prisma.servicePageConfig.findUnique({ where: { id: "ads-banner" } });
      if (page) {
        const config = page.config as typeof defaultAdsPage;
        await prisma.servicePageConfig.update({ where: { id: "ads-banner" }, data: { config: { ...config, websites: config.websites.filter(site => site.id !== fixtureSiteId) } } });
      }
    }
    // Close only unpaid provider artifacts created by this run; retain the local audit trail.
    for (const id of rows) {
      try {
        const row = await prisma.stripeOrder.findUniqueOrThrow({ where: { id } });
        if (!row.remoteId) continue;
        if (row.mode === "CHECKOUT") {
          const session = await client.checkout.sessions.retrieve(row.remoteId);
          if (session.status === "open") await client.checkout.sessions.expire(session.id);
        } else {
          const invoice = await client.invoices.retrieve(row.remoteId);
          if (invoice.status === "open") await client.invoices.voidInvoice(invoice.id);
        }
      } catch { console.log("Cleanup needs review for local Stripe order", id); }
    }
    await prisma.$disconnect();
  }
}
main().catch(error => {
  // Never print SDK request details, secrets or hosted payment URLs.
  console.error("STRIPE_SANDBOX_TEST_FAILED", error?.name, error?.code || error?.message?.slice(0, 140));
  process.exitCode = 1;
});
