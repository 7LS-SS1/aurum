import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
async function main() {
  const url = new URL(process.env.DATABASE_URL || "http://invalid");
  if (url.hostname !== "127.0.0.1" || url.port !== "55439" || url.pathname !== "/aurum_ads_test" || process.env.ADS_PAYMENT_MODE !== "simulation") throw Error("Isolated simulation DB only");
  const { prisma } = await import("../src/lib/prisma");
  const { createOrder, actOnOrder, simulatePayment, availability, readRenewalInfo } = await import("../src/lib/ads-orders");
  const { reconcileContracts } = await import("../src/lib/ads-renewal-server");
  const { renewalDeadline } = await import("../src/lib/ads-renewal");
  const { newSimulation } = await import("../src/lib/ads-simulation");
  const { saveAttachment } = await import("../src/lib/ads-attachments");
  const { adsPageSchema } = await import("../src/lib/ads-page-config");
  const { getInventory, quoteBooking, bookingSchema } = await import("../src/lib/ads-booking");
  const viewerId = randomUUID(), ids: string[] = [], files: string[] = [], actor = { id: null, role: "MANAGER" as const };
  const day = 86400000;
  try {
    await prisma.viewer.create({ data: { id: viewerId, email: `renew-${viewerId}@example.test`, displayName: "Renewal Test" } });
    const config = adsPageSchema.parse((await prisma.servicePageConfig.findUniqueOrThrow({ where: { id: "ads-banner" } })).config);
    const site = config.websites.find(s => s.enabled)!;
    const occupied = await availability(site.id);
    const free = getInventory(config).filter(s => !occupied.includes(s.id) && !s.id.startsWith("video_ad:"));
    assert.ok(free.length >= 4);
    const media = await saveAttachment(new Request("http://localhost", { method: "POST", headers: { "content-type": "image/png", "x-file-name": "renewal.png" }, body: new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWMInXk3dOZdBggFADAiBy1VU9MRAAAAAElFTkSuQmCC", "base64")) }), viewerId); files.push(media.id);
    async function fixture(endsAt: Date, slot: string) {
      const id = randomUUID(); ids.push(id);
      const simulation = { ...newSimulation(1500), phase: "active" as const };
      return prisma.adsOrder.create({ data: { id, viewerId, requestId: randomUUID(), tokenHash: randomUUID(), requestHash: randomUUID(), customer: { name: "Renewal Test", email: `renew-${viewerId}@example.test`, contact: "@test" }, quote: { website: site, items: [slot], simulation, kind: "slots", attachments: [{ slot, fileId: media.id, name: media.name, targetUrl: "https://brand.example.test" }] }, status: "ACTIVE", slots: [slot], days: 30, amount: 1500, artworkUrl: "", targetUrl: "https://brand.example.test", startsAt: new Date(endsAt.getTime() - 30 * day), endsAt } });
    }
    function input(parentId: string, slots: string[], mode: "same" | "change" = "same") {
      return bookingSchema.parse({ renewalOfId: parentId, renewalMode: mode, websiteId: site.id, requestId: randomUUID(), kind: "slots", slots, days: 30, expectedAmount: quoteBooking({ kind: "slots", slots, days: 30 }, config).amount, name: "Renewal Test", email: `renew-${viewerId}@example.test`, contact: "@test", targetUrl: "https://brand.example.test", note: "Local renewal test", attachments: slots.map(slot => ({ slot, fileId: media.id, targetUrl: "https://brand.example.test" })), acceptedTerms: true });
    }
    async function pay(id: string) {
      let order = await prisma.adsOrder.findUniqueOrThrow({ where: { id } });
      await simulatePayment({ id, revision: order.revision, action: "select", method: "qr" }, viewerId);
      order = await prisma.adsOrder.findUniqueOrThrow({ where: { id } });
      await simulatePayment({ id, revision: order.revision, action: "submit", outcome: "success" }, viewerId);
      await action(id, "sim_verify");
    }
    async function action(id: string, action: "sim_verify" | "sim_activate" | "sim_cancel" | "sim_install" | "sim_review") {
      const order = await prisma.adsOrder.findUniqueOrThrow({ where: { id } });
      return actOnOrder(id, { revision: order.revision, action, note: "Local renewal validation" }, actor);
    }
    const old = await fixture(new Date(Date.now() + day), free[0]!.id);
    await assert.rejects(readRenewalInfo(old.id, randomUUID()), /not_found/);
    assert.ok(!(await availability(site.id, old.id, viewerId)).includes(free[0]!.id));
    await assert.rejects(createOrder(input(old.id, [free[1]!.id]), randomBytes(32).toString("hex"), viewerId), /renewal_slots_changed/);
    const body = input(old.id, old.slots), token = randomBytes(32).toString("hex");
    const outcomes = await Promise.allSettled([createOrder(body, token, viewerId), createOrder({ ...body, requestId: randomUUID() }, randomBytes(32).toString("hex"), viewerId)]);
    assert.equal(outcomes.filter(r => r.status === "fulfilled").length, 1);
    const child = outcomes.find(r => r.status === "fulfilled")!;
    assert.equal(child.status, "fulfilled"); if (child.status !== "fulfilled") throw Error(); ids.push(child.value.id);
    // Whichever transaction won, only one renewal exists and its current quote is server-derived.
    const current = await prisma.adsOrder.findUniqueOrThrow({ where: { id: child.value.id } });
    if (current.requestId === body.requestId) assert.equal((await createOrder(body, token, viewerId)).id, current.id);
    assert.equal(current.amount, body.expectedAmount);
    await pay(current.id); await action(current.id, "sim_activate");
    let renewed = await prisma.adsOrder.findUniqueOrThrow({ where: { id: current.id } });
    assert.equal(renewed.status, "SCHEDULED"); assert.equal(renewed.startsAt!.getTime(), old.endsAt!.getTime());
    assert.equal(renewed.endsAt!.getTime() - renewed.startsAt!.getTime(), 30 * day);
    assert.equal((await prisma.adsOrder.findUniqueOrThrow({ where: { id: old.id } })).status, "ACTIVE");
    await assert.rejects(action(old.id, "sim_cancel"), /renewal_pending/);
    await prisma.$transaction(tx => reconcileContracts(tx, new Date(old.endsAt!.getTime() + 1000), [old.id, renewed.id]));
    renewed = await prisma.adsOrder.findUniqueOrThrow({ where: { id: current.id } });
    assert.equal(renewed.status, "ACTIVE");
    assert.equal((await prisma.adsOrder.findUniqueOrThrow({ where: { id: old.id } })).status, "COMPLETED");
    assert.equal((await prisma.adsOrder.findUniqueOrThrow({ where: { id: old.id } })).endsAt!.getTime(), old.endsAt!.getTime());
    await assert.rejects(action(current.id, "sim_activate"), /invalid_transition/);
    const grace = await fixture(new Date(Date.now() - day), free[1]!.id);
    assert.equal((await readRenewalInfo(grace.id, viewerId)).canRenew, true);
    assert.equal((await prisma.adsOrder.findUniqueOrThrow({ where: { id: grace.id } })).status, "GRACE");
    assert.ok((await availability(site.id)).includes(free[1]!.id), "Grace retains inventory");
    const blocker = await fixture(new Date(Date.now() + day), free[2]!.id);
    await assert.rejects(createOrder(input(grace.id, [free[2]!.id], "change"), randomBytes(32).toString("hex"), viewerId), /slots_unavailable/);
    await prisma.adsOrder.update({ where: { id: blocker.id }, data: { status: "COMPLETED" } });
    const changed = await createOrder(input(grace.id, [free[2]!.id], "change"), randomBytes(32).toString("hex"), viewerId); ids.push(changed.id);
    await pay(changed.id); await action(changed.id, "sim_install"); await action(changed.id, "sim_review"); await action(changed.id, "sim_activate");
    assert.equal((await prisma.adsOrder.findUniqueOrThrow({ where: { id: grace.id } })).status, "REMOVAL_REQUIRED");
    assert.equal((await prisma.adsOrder.findUniqueOrThrow({ where: { id: changed.id } })).startsAt!.getTime(), grace.endsAt!.getTime());
    const late = await fixture(new Date(Date.now() - 4 * day), free[3]!.id);
    assert.equal((await readRenewalInfo(late.id, viewerId)).canRenew, false);
    await assert.rejects(createOrder(input(late.id, late.slots), randomBytes(32).toString("hex"), viewerId), /renewal_expired/);
    const unpaidId = randomUUID(); ids.push(unpaidId);
    await prisma.adsOrder.create({ data: { id: unpaidId, viewerId, renewalOfId: late.id, requestId: randomUUID(), tokenHash: randomUUID(), requestHash: randomUUID(), customer: {}, slots: late.slots, days: 30, amount: 1500, artworkUrl: "", targetUrl: "", status: "REVIEW", quote: { renewal: { mode: "same", previousEndsAt: late.endsAt!.toISOString(), deadline: renewalDeadline(late.endsAt!).toISOString() } } } });
    assert.equal((await readRenewalInfo(late.id, viewerId)).pending, null);
    assert.equal((await prisma.adsOrder.findUniqueOrThrow({ where: { id: unpaidId } })).status, "EXPIRED", "Unpaid review cannot extend renewal eligibility");
    await prisma.adsOrder.update({ where: { id: late.id }, data: { status: "COMPLETED" } });
    const delayed = await fixture(new Date(Date.now() - 4 * day), free[3]!.id);
    const delayedId = randomUUID(); ids.push(delayedId);
    await prisma.adsOrder.create({ data: { id: delayedId, viewerId, renewalOfId: delayed.id, requestId: randomUUID(), tokenHash: randomUUID(), requestHash: randomUUID(), customer: {}, slots: delayed.slots, days: 30, amount: 1500, artworkUrl: "", targetUrl: "", status: "PAID", quote: { items: [], website: site, renewal: { mode: "same", previousEndsAt: delayed.endsAt!.toISOString(), deadline: renewalDeadline(delayed.endsAt!).toISOString() }, simulation: { ...newSimulation(1500), phase: "verified", method: "qr", receipt: { id: randomUUID(), amountTHB: 1500, outcome: "success", submittedAt: new Date(Date.now() - 2 * day).toISOString() } } } } });
    await action(delayedId, "sim_activate");
    assert.equal((await prisma.adsOrder.findUniqueOrThrow({ where: { id: delayedId } })).startsAt!.getTime(), delayed.endsAt!.getTime(), "Late staff approval must not shift original renewal start");
    console.log("ADS_RENEWALS_LOCAL_OK: ownership, concurrency, current pricing, same slots, grace inventory, scheduled/late approval, changed slots, no restart, expired cutoff, original dates preserved");
  } finally {
    await prisma.auditLog.deleteMany({ where: { resourceType: "ads_order", resourceId: { in: ids } } });
    await prisma.adsOrder.deleteMany({ where: { id: { in: ids }, renewalOfId: { not: null } } });
    await prisma.adsOrder.deleteMany({ where: { id: { in: ids } } });
    await prisma.viewer.deleteMany({ where: { id: viewerId } });
    for (const id of files) for (const extension of [".json", ".bin"]) await unlink(path.join(process.env.ADS_UPLOAD_DIR || ".local-ads-uploads", id + extension)).catch(() => {});
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
