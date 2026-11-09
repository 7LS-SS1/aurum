import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "./prisma";
import { ApiError } from "./api-response";
import { orderAlert } from "./ads-notification-events";
import type { Actor } from "./authz";
import { reconcileContracts } from "./ads-renewal-server";
import { orderNotice } from "./customer-notices";
import { readAttachment } from "./ads-attachments";

export const notificationKinds = ["NEW_ORDER", "PAYMENT_ISSUE", "CANCELLATION", "EXPIRING", "OTHER_ISSUE"] as const;
export const customerRequestSchema = z.object({ orderId: z.string().uuid(), requestId: z.string().uuid(), kind: z.enum(["PAYMENT_ISSUE", "CANCELLATION", "OTHER_ISSUE"]), reason: z.enum(["failed", "paid_unconfirmed", "cancel", "other"]), message: z.string().trim().min(10).max(2000) }).strict().refine(value => value.kind === "CANCELLATION" ? value.reason === "cancel" : value.kind === "OTHER_ISSUE" ? value.reason === "other" : ["failed", "paid_unconfirmed"].includes(value.reason));
const titles = { failed: "ลูกค้าแจ้งชำระเงินไม่สำเร็จ", paid_unconfirmed: "ลูกค้าแจ้งชำระสำเร็จแต่สถานะไม่อัปเดต", cancel: "ลูกค้าขอยกเลิกบริการ", other: "ลูกค้าแจ้งปัญหาคำสั่งซื้อ" };
const requestFields = { id: true, kind: true, title: true, message: true, status: true, response: true, createdAt: true, resolvedAt: true, messages: { orderBy: { createdAt: "asc" as const }, take: 200 } } as const;
export async function customerRequests(orderId: string, viewerId: string) {
  if (!await prisma.adsOrder.findFirst({ where: { id: orderId, viewerId }, select: { id: true } })) throw new ApiError("not_found", 404);
  return prisma.adsNotification.findMany({ where: { orderId, source: "CUSTOMER" }, select: requestFields, orderBy: { createdAt: "desc" }, take: 100 });
}
export async function submitCustomerRequest(input: z.infer<typeof customerRequestSchema>, viewerId: string) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(73421, 1)`;
    const order = await tx.adsOrder.findFirst({ where: { id: input.orderId, viewerId } });
    if (!order) throw new ApiError("not_found", 404);
    const dedupeKey = `customer:${viewerId}:${input.requestId}`;
    const existing = await tx.adsNotification.findUnique({ where: { dedupeKey } });
    if (existing) {
      if (existing.orderId !== order.id || existing.kind !== input.kind || existing.title !== titles[input.reason] || existing.message !== input.message) throw new ApiError("request_conflict", 409);
      return { id: existing.id };
    }
    if (input.kind === "CANCELLATION" && ["REJECTED", "REFUNDED", "COMPLETED", "EXPIRED", "REMOVAL_REQUIRED"].includes(order.status)) throw new ApiError("service_already_closed", 409);
    if (await tx.adsNotification.count({ where: { orderId: order.id, source: "CUSTOMER" } }) >= 100) throw new ApiError("request_limit", 429);
    if (await tx.adsNotification.findFirst({ where: { orderId: order.id, source: "CUSTOMER", kind: input.kind, status: "OPEN" } })) throw new ApiError("request_pending", 409);
    const item = await tx.adsNotification.create({ data: { id: randomUUID(), orderId: order.id, dedupeKey, source: "CUSTOMER", kind: input.kind, title: titles[input.reason], message: input.message } });
    await tx.auditLog.create({ data: { actorRole: "SYSTEM", action: "ads_order_customer_request", resourceType: "ads_order", resourceId: order.id, metadata: { note: `${titles[input.reason]}: ${input.message}`, viewerId, requestId: item.id } } });
    return { id: item.id };
  }, { maxWait: 10000, timeout: 15000 });
}

// Reconciled whenever staff opens/polls the inbox. No browser must stay open:
// Catch up contract transitions and alerts on the next visit/poll.
export async function refreshExpiryAlerts(now = new Date()) {
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(73421, 1)`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(73421, 2)`;
    await reconcileContracts(tx, now);
    const due = await tx.adsOrder.findMany({ where: { status: { in: ["ACTIVE", "GRACE", "REMOVAL_REQUIRED"] }, endsAt: { lte: new Date(now.getTime() + 7 * 86400000) }, notifications: { none: { dedupeKey: { startsWith: "expiry:" } } } }, select: { id: true, endsAt: true }, take: 200, orderBy: { endsAt: "asc" } });
    for (const order of due) {
      const key = `expiry:${order.id}:${order.endsAt!.toISOString()}`;
      const message = `วันสิ้นสุดสัญญา ${order.endsAt!.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })} (เวลาประเทศไทย) คงป้ายไว้ในช่วงต่ออายุ 3 วัน และรออนุมัติหากจ่ายทันกำหนด นำออกได้เฉพาะเมื่อระบบขึ้นรอนำป้ายออก`;
      await orderAlert(tx, { orderId: order.id, key, kind: "EXPIRING", title: "บริการใกล้สิ้นสุด / ครบกำหนด", message });
      await orderNotice(tx, order.id, key, "บริการใกล้สิ้นสุด / ครบกำหนด", message);
    }
  }, { maxWait: 10000, timeout: 15000 });
}
export async function listNotifications(input: { status?: "OPEN" | "RESOLVED"; kind?: typeof notificationKinds[number]; orderId?: string; source?: "CUSTOMER"; cursor?: string; summary?: boolean }) {
  await refreshExpiryAlerts();
  const where = { ...(input.status ? { status: input.status } : {}), ...(input.kind ? { kind: input.kind } : {}), ...(input.orderId ? { orderId: input.orderId } : {}), ...(input.source ? { source: input.source } : {}) };
  const [unread, open, rows] = await Promise.all([
    prisma.adsNotification.count({ where: { status: "OPEN", readAt: null } }),
    prisma.adsNotification.count({ where: { status: "OPEN" } }),
    input.summary ? Promise.resolve([]) : prisma.adsNotification.findMany({ where, include: { messages: { orderBy: { createdAt: "asc" }, take: 200 }, order: { select: { status: true, customer: true, days: true, startsAt: true, endsAt: true, quote: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}) }),
  ]);
  return { unread, open, items: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49]!.id : null };
}
export async function updateNotification(id: string, action: "read" | "resolve", response: string, actor: Actor) {
  return prisma.$transaction(async tx => {
    const item = await tx.adsNotification.findUnique({ where: { id } });
    if (!item) throw new ApiError("not_found", 404);
    if (action === "read") { await tx.adsNotification.updateMany({ where: { id, readAt: null }, data: { readAt: new Date() } }); return; }
    if (item.source === "CUSTOMER" && response.trim().length < 5) throw new ApiError("response_required", 422);
    const now = new Date();
    const updated = await tx.adsNotification.updateMany({ where: { id, status: "OPEN" }, data: { status: "RESOLVED", response, resolvedAt: now, readAt: item.readAt || now } });
    if (!updated.count) throw new ApiError("already_resolved", 409);
    if (item.source === "CUSTOMER") await orderNotice(tx, item.orderId, `ticket-resolved:${item.id}:${now.toISOString()}`, "เจ้าหน้าที่ตอบคำร้องแล้ว", response);
    await tx.auditLog.create({ data: { actorId: actor.id, actorRole: actor.role, action: "ads_order_notification_resolved", resourceType: "ads_order", resourceId: item.orderId, metadata: { note: item.source === "CUSTOMER" ? response : "เจ้าหน้าที่ดำเนินการแจ้งเตือนแล้ว", notificationId: item.id } } });
  });
}

export const ticketReplySchema = z.object({ id: z.string().uuid(), requestId: z.string().uuid(), message: z.string().trim().min(3).max(2000), files: z.array(z.string().uuid()).max(3).default([]), reopen: z.boolean().default(false) }).strict();
export async function replyToTicket(input: z.infer<typeof ticketReplySchema>, identity: { viewerId: string } | { actor: Actor }) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(73421, 1)`;
    const item = await tx.adsNotification.findUnique({ where: { id: input.id }, include: { order: { select: { viewerId: true } } } });
    if (!item || item.source !== "CUSTOMER" || ("viewerId" in identity && identity.viewerId !== item.order.viewerId)) throw new ApiError("not_found",404);
    const authorId = "viewerId" in identity ? identity.viewerId : identity.actor.id;
    if (!authorId) throw new ApiError("unauthorized",401);
    const role = "viewerId" in identity ? "CUSTOMER" : "STAFF";
    const previous = await tx.adsTicketMessage.findUnique({ where: { requestId: input.requestId } });
    if (previous) {
      if(previous.ticketId!==item.id || previous.authorId!==authorId || previous.message!==input.message || JSON.stringify(previous.files)!==JSON.stringify(input.files)) throw new ApiError("request_conflict",409);
      return previous;
    }
    if (item.status !== "OPEN" && !input.reopen) throw new ApiError("ticket_closed",409);
    if (await tx.adsTicketMessage.count({where:{ticketId:item.id}})>=200) throw new ApiError("request_limit",429);
    for (const id of input.files) { const file=await readAttachment(id); if(role!=="CUSTOMER" || file.owner!==authorId) throw new ApiError("invalid_attachment",422); }
    const result=await tx.adsTicketMessage.create({data:{ticketId:item.id,requestId:input.requestId,role,authorId,message:input.message,files:input.files}});
    await tx.adsNotification.update({where:{id:item.id},data:{status:"OPEN",resolvedAt:null,...(role==="CUSTOMER"?{readAt:null}:{})}});
    if(role==="STAFF") await orderNotice(tx,item.orderId,`ticket-message:${result.id}`,"ข้อความจากเจ้าหน้าที่",input.message);
    await tx.auditLog.create({data:{actorRole:"viewerId" in identity?"SYSTEM":identity.actor.role,actorId:"actor" in identity?identity.actor.id:undefined,action:"ads_order_ticket_reply",resourceType:"ads_order",resourceId:item.orderId,metadata:{note:input.message,ticketId:item.id,messageId:result.id,reopened:input.reopen}}});
    return result;
  });
}
