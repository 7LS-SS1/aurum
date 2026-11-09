import type { AdsOrder, Prisma } from "@prisma/client";
import { ApiError } from "./api-response";
import { getSimulation } from "./ads-simulation";
import { getPromptPay } from "./promptpay";
import { getRenewal, renewalDeadline, renewalWindow, withinRenewal } from "./ads-renewal";
import { orderAlert } from "./ads-notification-events";
import { orderNotice } from "./customer-notices";
import { hasStripeBilling } from "./stripe-policy";

export { reservedStatuses } from "./ads-inventory-status";
export const abandonedRenewals = ["REJECTED", "EXPIRED", "REFUNDED"];
export function paidAt(order: Pick<AdsOrder, "quote" | "amount">): Date | null {
  const simulation = getSimulation(order.quote);
  if (simulation?.receipt?.outcome === "success" && simulation.receipt.amountTHB === order.amount) return new Date(simulation.receipt.submittedAt);
  const payment = getPromptPay(order.quote);
  if (payment?.state === "received" && payment.receivedAt) return new Date(payment.providerPaidAt || payment.receivedAt);
  const quote = order.quote as Prisma.JsonObject;
  return typeof quote?.paymentConfirmedAt === "string" ? new Date(quote.paymentConfirmedAt) : null;
}
export function paidOnTime(order: Pick<AdsOrder, "quote" | "amount">) {
  const renewal = getRenewal(order.quote), paid = paidAt(order);
  return !!paid && (!renewal || paid.getTime() < Date.parse(renewal.deadline));
}
export async function renewalParent(tx: Prisma.TransactionClient, id: string, viewerId: string, now = new Date()) {
  const parent = await tx.adsOrder.findFirst({ where: { id, viewerId } });
  if (!parent) throw new ApiError("not_found", 404);
  if (!["ACTIVE", "GRACE"].includes(parent.status) || !parent.startsAt || !withinRenewal(parent.endsAt, now)) throw new ApiError("renewal_expired", 409);
  const pending = await tx.adsOrder.findFirst({ where: { renewalOfId: id, status: { notIn: abandonedRenewals } }, select: { id: true } });
  if (pending) throw new ApiError("renewal_pending", 409);
  return parent;
}
export async function ensureRenewalPayable(tx: Prisma.TransactionClient, order: AdsOrder) {
  if (!order.renewalOfId) return;
  const renewal = getRenewal(order.quote);
  const parent = await tx.adsOrder.findUnique({ where: { id: order.renewalOfId } });
  if (!renewal || Date.now() >= Date.parse(renewal.deadline) || !parent || !["ACTIVE", "GRACE"].includes(parent.status)) throw new ApiError("renewal_expired", 409);
}
async function transition(tx: Prisma.TransactionClient, order: AdsOrder, status: string, note: string) {
  await tx.adsOrder.update({ where: { id: order.id }, data: { status, revision: { increment: 1 } } });
  await tx.auditLog.create({ data: { actorRole: "SYSTEM", action: "ads_order_contract_transition", resourceType: "ads_order", resourceId: order.id, metadata: { before: order.status, after: status, note } } });
  await orderNotice(tx,order.id,`transition:${order.id}:${order.revision+1}`,"อัปเดตระยะเวลาบริการ",note);
}
export async function finishPreviousCycle(tx: Prisma.TransactionClient, order: AdsOrder) {
  if (!order.renewalOfId) return;
  const parent = await tx.adsOrder.findUniqueOrThrow({ where: { id: order.renewalOfId } });
  if (["COMPLETED", "REMOVAL_REQUIRED"].includes(parent.status)) return;
  const removed = parent.slots.filter(slot => !order.slots.includes(slot));
  await transition(tx, parent, removed.length ? "REMOVAL_REQUIRED" : "COMPLETED", removed.length
    ? `เริ่มรอบต่ออายุ #${order.id} แล้ว · นำออกเฉพาะตำแหน่งที่ไม่อยู่ในรอบใหม่: ${removed.join(", ")} ห้ามถอดตำแหน่งที่ต่ออายุ`
    : `ต่ออายุเป็นคำสั่งซื้อ #${order.id} แล้ว คงป้ายเดิมไว้ ประวัติวันสัญญารอบเดิมไม่เปลี่ยน`);
}
export async function approveRenewal(tx: Prisma.TransactionClient, order: AdsOrder) {
  const window = renewalWindow(order.quote, order.days);
  if (!order.renewalOfId) return window;
  const parent = await tx.adsOrder.findUniqueOrThrow({ where: { id: order.renewalOfId } });
  if (!getRenewal(order.quote) || !paidOnTime(order) || !["ACTIVE", "GRACE"].includes(parent.status)) throw new ApiError("renewal_payment_required", 409);
  if ((getRenewal(order.quote)?.mode === "change" || getRenewal(order.quote)?.artworkChanged) && window.status === "SCHEDULED") throw new ApiError("renewal_change_not_due", 409);
  if (window.endsAt <= new Date()) throw new ApiError("renewal_period_elapsed", 409);
  if (window.status === "ACTIVE") await finishPreviousCycle(tx, order);
  return window;
}
// Called under the same inventory advisory lock as booking/payment/approval.
export async function reconcileContracts(tx: Prisma.TransactionClient, now = new Date(), scope?: string[]) {
  const scoped = scope ? { id: { in: scope } } : {};
  const unpaidRenewals = await tx.adsOrder.findMany({ where: { ...scoped, status: "REVIEW", renewalOfId: { not: null } } });
  for (const order of unpaidRenewals) {
    const renewal = getRenewal(order.quote);
    if (renewal && now.getTime() >= Date.parse(renewal.deadline)) await transition(tx, order, "EXPIRED", "พ้นกำหนดชำระต่ออายุ 3 วัน ต้องเปิดสัญญาใหม่");
  }
  const payments = await tx.adsOrder.findMany({ where: { ...scoped, status: "PAYMENT", holdUntil: { lte: now } } });
  for (const order of payments) {
    // A successful submission awaits staff verification, not a second payment.
    if (paidOnTime(order)) continue;
    // Keep inventory until Stripe confirms the payment channel cannot accept money.
    if (hasStripeBilling(order.quote) && !await tx.stripeOrder.findFirst({ where: { bannerOrderId: order.id, status: { in: ["EXPIRED", "VOID"] } } })) continue;
    await transition(tx, order, "EXPIRED", "หมดระยะเวลาชำระเงิน");
  }
  const scheduled = await tx.adsOrder.findMany({ where: { ...scoped, status: "SCHEDULED", startsAt: { lte: now } } });
  for (const order of scheduled) {
    await finishPreviousCycle(tx, order);
    await transition(tx, order, "ACTIVE", "เริ่มรอบต่ออายุอัตโนมัติต่อจากวันสิ้นสุดสัญญาเดิม");
  }
  const ended = await tx.adsOrder.findMany({ where: { ...scoped, status: { in: ["ACTIVE", "GRACE", "REMOVAL_REQUIRED"] }, endsAt: { lte: now } } });
  for (const order of ended) {
    const successor = await tx.adsOrder.findFirst({ where: { renewalOfId: order.id, status: { notIn: abandonedRenewals } } });
    if (successor && ["ACTIVE", "SCHEDULED"].includes(successor.status)) { await finishPreviousCycle(tx, successor); continue; }
    const waitingPaid = successor && ["PAYMENT", "PAYMENT_REVIEW", "PAID"].includes(successor.status) && paidOnTime(successor);
    if (successor && waitingPaid) await orderAlert(tx, { orderId: successor.id, key: `renewal-due:${successor.id}`, kind: "EXPIRING", title: "ถึงรอบต่ออายุ · รอตรวจและอนุมัติ", message: "ลูกค้าชำระต่ออายุทันกำหนด ยังคงป้ายเดิมไว้ ตรวจยอดและดำเนินงานรอบใหม่ก่อนอนุมัติ วันเริ่มต่อจากวันสิ้นสุดเดิม" });
    const status = now < renewalDeadline(order.endsAt!) || waitingPaid ? "GRACE" : "REMOVAL_REQUIRED";
    if (order.status !== status) await transition(tx, order, status, status === "GRACE" ? "ช่วงผ่อนผันต่ออายุ 3 วัน ยังคงป้ายไว้ หากชำระทันกำหนดให้รอเจ้าหน้าที่อนุมัติ" : "พ้น 3 วันโดยยังไม่ชำระต่ออายุ รอเจ้าหน้าที่นำป้ายออก ลูกค้าต้องเปิดสัญญาใหม่");
  }
}
