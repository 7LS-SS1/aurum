import { prisma } from "./prisma";
import { stripeSettings } from "./stripe-config";
import { reconcileStripeOrder } from "./stripe-orders";
import { orderAlert } from "./ads-notification-events";

export async function recoverStripePayments(cursor?: string) {
  const result = { enabled: process.env.STRIPE_RECONCILIATION_ENABLED === "true", checked: 0, failed: 0, failedOrderIds: [] as string[], cursor: cursor || null as string | null, configurationError: false };
  if (!result.enabled) return result;
  let accountId: string;
  try { accountId = stripeSettings().accountId; }
  catch { return { ...result, failed: 1, configurationError: true }; }
  const where = { accountId, status: { in: ["CREATING", "OPEN", "PAID", "REVIEW", "EXPIRED", "REFUNDED"] } };
  let rows = await prisma.stripeOrder.findMany({ where: { ...where, ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: "asc" }, take: 5 });
  if (!rows.length && cursor) rows = await prisma.stripeOrder.findMany({ where, orderBy: { id: "asc" }, take: 5 });
  const deadline = Date.now() + 180000;
  for (const row of rows) {
    if (Date.now() >= deadline) break;
    try {
      if (!row.remoteId) throw Error("creation_needs_operator_reconciliation");
      await reconcileStripeOrder(row.id);
      result.checked++;
    } catch {
      result.failed++;
      result.failedOrderIds.push(row.id);
      if (row.bannerOrderId) await orderAlert(prisma, { orderId: row.bannerOrderId, key: `stripe-recovery:${row.id}`, kind: "PAYMENT_ISSUE", title: "ตรวจสอบ Stripe ไม่สำเร็จ", message: "ระบบจะตรวจซ้ำในรอบถัดไป ตรวจรายละเอียดรายการเดิมก่อนสร้างการชำระใหม่" });
    }
    result.cursor = row.id;
  }
  return result;
}
