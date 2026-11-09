import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

async function main() {
  const database = new URL(process.env.DATABASE_URL || "http://invalid");
  if (database.hostname !== "127.0.0.1" || database.port !== "55439" || database.pathname !== "/aurum_ads_test") throw Error("Isolated local database only");
  Object.assign(process.env, { NODE_ENV: "test" });
  process.env.ADS_PROMPTPAY_MODE = "sandbox";
  process.env.TWOC2P_MERCHANT_ID = "TESTONLY";
  process.env.TWOC2P_SECRET_KEY = "local-signed-fixture-not-a-provider-key";
  process.env.PAYMENTS_PUBLIC_ORIGIN = "https://aurum123.com";
  const { prisma } = await import("../src/lib/prisma");
  const { startPromptPay, reconcilePromptPay, readPromptPayOrder, handlePromptPayWebhook } = await import("../src/lib/promptpay-orders");
  const { signGatewayJwt, verifyGatewayJwt } = await import("../src/lib/promptpay-2c2p");
  const { getPromptPay } = await import("../src/lib/promptpay");
  const { getSimulation } = await import("../src/lib/ads-simulation");
  const { actOnOrder } = await import("../src/lib/ads-orders");
  const { adsPageSchema } = await import("../src/lib/ads-page-config");
  const { getInventory } = await import("../src/lib/ads-booking");
  const ids: string[] = []; let viewerId: string | undefined;
  const originalFetch = globalThis.fetch;
  let creates = 0, result: "pending" | "paid" | "mismatch" | "timeout" = "pending";
  let reuseReference = false; let providerTime:string|undefined;
  const invoices = new Map<string, number>();
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    assert.ok(url.startsWith("https://sandbox-pgw.2c2p.com/payment/4.5/"), "No real network calls allowed");
    const data = verifyGatewayJwt(JSON.parse(String(init?.body)).payload, process.env.TWOC2P_SECRET_KEY!);
    if (url.endsWith("/paymentToken")) {
      creates++; invoices.set(String(data.invoiceNo), Number(data.amount));
      if (result === "timeout") throw Error("Injected timeout after request reached provider");
      return Response.json({ payload: signGatewayJwt({ respCode: "0000", webPaymentUrl: "https://sandbox-pgw-ui.2c2p.com/payment/test" }, process.env.TWOC2P_SECRET_KEY!) });
    }
    assert.ok(url.endsWith("/paymentInquiry"));
    const payload = result === "pending" ? { respCode: "1000" } : { respCode: "0000", merchantID: data.merchantID, invoiceNo: data.invoiceNo, currencyCode: "THB", channelCode: "ETQ", amount: invoices.get(String(data.invoiceNo))! - (result === "mismatch" ? 1 : 0), ...(providerTime?{transactionDateTime:providerTime}:{}), referenceNo: reuseReference ? "REF" + [...invoices.keys()][0] : "REF" + data.invoiceNo };
    return Response.json({ payload: signGatewayJwt(payload, process.env.TWOC2P_SECRET_KEY!) });
  };
  try {
    const viewer = await prisma.viewer.create({ data: { id: randomUUID(), email: `promptpay-${randomUUID()}@example.test`, displayName: "PromptPay isolated test" } }); viewerId = viewer.id;
    const config = adsPageSchema.parse((await prisma.servicePageConfig.findUniqueOrThrow({ where: { id: "ads-banner" } })).config);
    const site = config.websites.find(s => s.enabled)!; assert.ok(site);
    const occupied = (await prisma.adsOrder.findMany({ where: { status: { in: ["PAYMENT", "PAYMENT_REVIEW", "PAID", "ACTIVE", "REMOVAL_REQUIRED", "REFUND_REQUIRED"] } }, select: { slots: true, quote: true } })).filter(o => !getSimulation(o.quote)).flatMap(o => o.slots);
    const free = getInventory(config).filter(s => !occupied.includes(s.id)); assert.ok(free.length >= 4);
    async function fixture(slot = free[0]!.id) {
      const id = randomUUID(); ids.push(id);
      return prisma.adsOrder.create({ data: { id, viewerId, requestId: randomUUID(), requestHash: randomUUID(), tokenHash: randomUUID(), customer: { name: "PromptPay test", email: viewer.email, contact: "@test" }, quote: { website: site, items: [slot] }, slots: [slot], amount: 1500, days: 30, artworkUrl: "", targetUrl: "" } });
    }
    const first = await fixture();
    await assert.rejects(startPromptPay(first.id, randomUUID()), /not_found/);
    await assert.rejects(readPromptPayOrder(first.id, randomUUID()), /not_found/);
    await Promise.all([startPromptPay(first.id, viewer.id), startPromptPay(first.id, viewer.id)]);
    assert.equal(creates, 1, "Concurrent create must make only one provider request");
    let order = await readPromptPayOrder(first.id, viewer.id); assert.equal(order.status, "PAYMENT"); assert.equal(order.promptpay?.state, "ready");
    assert.ok(order.quote && typeof order.quote === "object" && !("promptpay" in order.quote), "No raw provider snapshot in public quote");
    const conflict = await fixture(); await assert.rejects(startPromptPay(conflict.id, viewer.id), /slots_unavailable/);
    assert.equal((await reconcilePromptPay(first.id, viewer.id)).received, false);
    await assert.rejects(actOnOrder(first.id, { revision: order.revision, action: "confirm_payment", note: "Manual bypass", reference: "fake", amount: 1500 }, { id: null, role: "MANAGER" }), /gateway_verification_required/);
    result = "mismatch"; await assert.rejects(reconcilePromptPay(first.id, viewer.id), /gateway_payment_mismatch/);
    assert.equal((await readPromptPayOrder(first.id, viewer.id)).status, "PAYMENT");
    result = "paid";
    const before = getPromptPay((await prisma.adsOrder.findUniqueOrThrow({ where: { id: first.id } })).quote)!;
    const callback = signGatewayJwt({ merchantID: before.merchantID, invoiceNo: before.invoiceNo }, process.env.TWOC2P_SECRET_KEY!);
    await assert.rejects(handlePromptPayWebhook(signGatewayJwt({ merchantID: before.merchantID, invoiceNo: before.invoiceNo }, "attacker")), /invalid_gateway_signature/);
    await Promise.all([handlePromptPayWebhook(callback), handlePromptPayWebhook(callback)]);
    order = await readPromptPayOrder(first.id, viewer.id);
    assert.equal(order.status, "PAYMENT_REVIEW"); assert.equal(order.startsAt, null); assert.equal(order.promptpay?.checkoutUrl, null);
    assert.equal(await prisma.auditLog.count({ where: { resourceId: first.id, action: "ads_order_promptpay_received" } }), 1);
    await assert.rejects(actOnOrder(first.id, { revision: order.revision, action: "activate", note: "Cannot skip staff review" }, { id: null, role: "MANAGER" }), /payment_required/);
    await actOnOrder(first.id, { revision: order.revision, action: "gateway_confirm", note: "Staff verified gateway receipt" }, { id: null, role: "MANAGER" });
    order = await readPromptPayOrder(first.id, viewer.id); assert.equal(order.status, "PAID"); assert.equal(order.startsAt, null);
    await assert.rejects(actOnOrder(first.id, {revision:order.revision,action:"activate",note:"Missing installation evidence"},{id:null,role:"MANAGER"}),/installation_review_required/);
    await prisma.adsOrder.update({where:{id:first.id},data:{fulfillmentStage:"review",installationProof:[{slot:"home_top:L1",url:"https://example.test/proof"}]}});
    await actOnOrder(first.id, { revision: order.revision, action: "activate", note: "Installation verified" }, { id: null, role: "MANAGER" });
    const active = await readPromptPayOrder(first.id, viewer.id); assert.equal(active.status, "ACTIVE"); assert.equal(active.endsAt!.getTime() - active.startsAt!.getTime(), 30 * 86400000);
    await handlePromptPayWebhook(callback); assert.equal((await readPromptPayOrder(first.id, viewer.id)).revision, active.revision);
    const late = await fixture(free[1]!.id); result = "pending"; await startPromptPay(late.id, viewer.id);
    await prisma.adsOrder.update({ where: { id: late.id }, data: { holdUntil: new Date(Date.now() - 1000) } });
    result = "paid"; assert.equal((await reconcilePromptPay(late.id, viewer.id)).order.status, "REFUND_REQUIRED");
    assert.equal((await readPromptPayOrder(late.id, viewer.id)).startsAt, null);
    const timeout = await fixture(free[2]!.id); result = "timeout";
    await assert.rejects(startPromptPay(timeout.id, viewer.id), /gateway_unavailable/);
    const count = creates; await startPromptPay(timeout.id, viewer.id); assert.equal(creates, count);
    assert.equal((await readPromptPayOrder(timeout.id, viewer.id)).promptpay?.state, "unknown");
    result = "paid"; reuseReference = true; await assert.rejects(reconcilePromptPay(timeout.id, viewer.id), /gateway_duplicate_payment/);
    reuseReference = false; await reconcilePromptPay(timeout.id, viewer.id);
    assert.equal((await readPromptPayOrder(timeout.id, viewer.id)).status, "PAYMENT_REVIEW");
    process.env.TWOC2P_TRANSACTION_UTC_OFFSET = "+00:00";
    const delayed = await fixture(free[3]!.id); result="pending"; await startPromptPay(delayed.id,viewer.id);
    const delayedRaw=await prisma.adsOrder.findUniqueOrThrow({where:{id:delayed.id}});
    const delayedPayment=getPromptPay(delayedRaw.quote)!;
    const paidAt=new Date(Date.now()-120000);providerTime=paidAt.toISOString().replace(/[-:T]/g,"").slice(0,14);
    await prisma.adsOrder.update({where:{id:delayed.id},data:{status:"EXPIRED",holdUntil:new Date(Date.now()-60000),quote:{...(delayedRaw.quote as Prisma.JsonObject),promptpay:{...delayedPayment,createdAt:new Date(Date.now()-180000).toISOString()}}}});
    result="paid";assert.equal((await reconcilePromptPay(delayed.id,viewer.id)).order.status,"PAYMENT_REVIEW","Timely provider payment can recover delayed callback while inventory is free");
    const replaced=await fixture(free[3]!.id);await prisma.adsOrder.update({where:{id:delayed.id},data:{status:"COMPLETED"}});result="pending";await startPromptPay(replaced.id,viewer.id);
    const replacedRaw=await prisma.adsOrder.findUniqueOrThrow({where:{id:replaced.id}});const replacedPayment=getPromptPay(replacedRaw.quote)!;
    await prisma.adsOrder.update({where:{id:replaced.id},data:{status:"EXPIRED",holdUntil:new Date(Date.now()-60000),quote:{...(replacedRaw.quote as Prisma.JsonObject),promptpay:{...replacedPayment,createdAt:new Date(Date.now()-180000).toISOString()}}}});
    const occupiedAgain=await fixture(free[3]!.id);await prisma.adsOrder.update({where:{id:occupiedAgain.id},data:{status:"PAID"}});
    result="paid";assert.equal((await reconcilePromptPay(replaced.id,viewer.id)).order.status,"REFUND_REQUIRED","Never reclaim another order's allocated slot");providerTime=undefined;
    const stored = await prisma.adsOrder.findUniqueOrThrow({ where: { id: first.id } });
    assert.equal((stored.quote as Prisma.JsonObject).items instanceof Array, true);
    console.log("PROMPTPAY_LOCAL_OK: signed mocked provider, concurrent single invoice, inventory, owner, no manual bypass, exact amount, duplicate callback/reference, timeout reconciliation, late refund queue, staff review and activation clock; NO EXTERNAL GATEWAY CALLS");
  } finally {
    globalThis.fetch = originalFetch;
    await prisma.auditLog.deleteMany({ where: { resourceType: "ads_order", resourceId: { in: ids } } });
    await prisma.adsOrder.deleteMany({ where: { id: { in: ids } } });
    if (viewerId) await prisma.viewer.delete({ where: { id: viewerId } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
