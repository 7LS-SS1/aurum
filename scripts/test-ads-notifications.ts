import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
async function main() {
  const dbUrl = new URL(process.env.DATABASE_URL || "http://invalid");
  if (dbUrl.hostname !== "127.0.0.1" || dbUrl.port !== "55439" || dbUrl.pathname !== "/aurum_ads_test") throw Error("Isolated local database only");
  const { prisma } = await import("../src/lib/prisma");
  const { customerRequests, submitCustomerRequest, refreshExpiryAlerts, updateNotification, customerRequestSchema } = await import("../src/lib/ads-notifications");
  const { actOnOrder } = await import("../src/lib/ads-orders");
  const { orderAlert } = await import("../src/lib/ads-notification-events");
  const viewerId = randomUUID(), ids: string[] = [];
  const actor = { id: null, role: "MANAGER" as const };
  try {
    await prisma.viewer.create({ data: { id: viewerId, email: `notifications-${viewerId}@example.test`, displayName: "Notification test" } });
    async function fixture(status = "REVIEW", endsAt: Date | null = null) {
      const id = randomUUID(); ids.push(id);
      return prisma.adsOrder.create({ data: { id, viewerId, requestId: randomUUID(), requestHash: randomUUID(), tokenHash: randomUUID(), customer: { name: "Notification test" }, quote: { items: ["Local fixture"] }, slots: [], amount: 1500, days: 30, artworkUrl: "", targetUrl: "", status, endsAt, startsAt: endsAt ? new Date(endsAt.getTime() - 30 * 86400000) : null } });
    }
    const order = await fixture();
    const input = customerRequestSchema.parse({ orderId: order.id, requestId: randomUUID(), kind: "PAYMENT_ISSUE", reason: "paid_unconfirmed", message: "Paid but awaiting confirmation — local test" });
    await assert.rejects(submitCustomerRequest(input, randomUUID()), /not_found/);
    const [first, duplicate] = await Promise.all([submitCustomerRequest(input, viewerId), submitCustomerRequest(input, viewerId)]);
    assert.equal(first.id, duplicate.id);
    assert.equal(await prisma.adsNotification.count({ where: { orderId: order.id } }), 1);
    await assert.rejects(submitCustomerRequest({ ...input, message: "Changed request content" }, viewerId), /request_conflict/);
    await assert.rejects(submitCustomerRequest({ ...input, requestId: randomUUID() }, viewerId), /request_pending/);
    await assert.rejects(customerRequests(order.id, randomUUID()), /not_found/);
    await assert.rejects(updateNotification(first.id, "resolve", "", actor), /response_required/);
    await updateNotification(first.id, "read", "", actor);
    assert.ok((await prisma.adsNotification.findUniqueOrThrow({ where: { id: first.id } })).readAt);
    await updateNotification(first.id, "resolve", "ตรวจสอบแล้ว โปรดดูผลในคำสั่งซื้อ", actor);
    await assert.rejects(updateNotification(first.id, "resolve", "Second operator", actor), /already_resolved/);
    const visible = await customerRequests(order.id, viewerId);
    assert.equal(visible[0]!.status, "RESOLVED"); assert.ok(visible[0]!.response);
    assert.equal((await prisma.adsOrder.findUniqueOrThrow({ where: { id: order.id } })).status, "REVIEW", "Reports/replies must not mark payment successful");
    const cancel = { ...input, requestId: randomUUID(), kind: "CANCELLATION" as const, reason: "cancel" as const, message: "Request cancellation for local test" };
    await submitCustomerRequest(cancel, viewerId);
    assert.equal((await prisma.adsOrder.findUniqueOrThrow({ where: { id: order.id } })).status, "REVIEW", "Cancellation request does not cancel/refund automatically");
    const paid = await fixture("PAID"); await prisma.adsOrder.update({where:{id:paid.id},data:{fulfillmentStage:"review",installationProof:[]}}); const before = Date.now();
    await actOnOrder(paid.id, { revision: 1, action: "activate", note: "Test installation approved" }, actor);
    const active = await prisma.adsOrder.findUniqueOrThrow({ where: { id: paid.id } });
    assert.ok(active.startsAt!.getTime() >= before && active.startsAt!.getTime() <= Date.now());
    assert.equal(active.endsAt!.getTime() - active.startsAt!.getTime(), 30 * 86400000);
    await assert.rejects(actOnOrder(paid.id, { revision: active.revision, action: "activate", note: "Cannot restart clock" }, actor), /payment_required/);
    assert.equal((await prisma.adsOrder.findUniqueOrThrow({ where: { id: paid.id } })).endsAt!.getTime(), active.endsAt!.getTime());
    const now = new Date(); const soon = await fixture("ACTIVE", new Date(now.getTime() + 7 * 86400000)); const later = await fixture("ACTIVE", new Date(now.getTime() + 8 * 86400000)); const overdue = await fixture("REMOVAL_REQUIRED", new Date(now.getTime() - 1000));
    await Promise.all([refreshExpiryAlerts(now), refreshExpiryAlerts(now)]);
    assert.equal(await prisma.adsNotification.count({ where: { orderId: soon.id, kind: "EXPIRING" } }), 1);
    assert.equal(await prisma.adsNotification.count({ where: { orderId: later.id, kind: "EXPIRING" } }), 0);
    assert.equal(await prisma.adsNotification.count({ where: { orderId: overdue.id, kind: "EXPIRING" } }), 1);
    assert.equal((await prisma.adsOrder.findUniqueOrThrow({ where: { id: soon.id } })).endsAt!.getTime(), soon.endsAt!.getTime());
    const internal = await prisma.$transaction(tx => orderAlert(tx, { orderId: order.id, key: `test-new:${order.id}`, kind: "NEW_ORDER", title: "New test", message: "Local test" }));
    await updateNotification(internal.id, "resolve", "Internal staff-only note", actor);
    const publicLogs = await prisma.auditLog.findMany({ where: { resourceId: order.id, action: "ads_order_notification_resolved" } });
    assert.ok(!JSON.stringify(publicLogs.map(log => log.metadata)).includes("Internal staff-only note"));
    assert.equal((await customerRequests(order.id, viewerId)).length, 2, "Internal alerts are not exposed in customer requests");
    console.log("ADS_NOTIFICATIONS_LOCAL_OK: ownership, duplicate requests, replies/CAS, no payment/cancel mutation, exact 30-day server clock, no restart, 7-day and overdue dedupe, private customer projection");
  } finally {
    await prisma.auditLog.deleteMany({ where: { resourceType: "ads_order", resourceId: { in: ids } } });
    await prisma.adsOrder.deleteMany({ where: { id: { in: ids } } });
    await prisma.viewer.deleteMany({ where: { id: viewerId } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
