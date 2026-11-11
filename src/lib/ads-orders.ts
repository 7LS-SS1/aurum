import { manualOccupiedSlots } from "./ads-manual";
import { createHash, randomUUID } from "node:crypto";
import { Prisma, type AdsOrder } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./prisma";
import { ApiError } from "./api-response";
import { adsPageSchema, defaultAdsPage } from "./ads-page-config";
import { adsSlotsOverlap, occupiedPhysicalSlots, getInventory, quoteBooking, type BookingInput } from "./ads-booking";
import type { Actor } from "./authz";
import { readAttachment } from "./ads-attachments";
import { getSimulation, newSimulation } from "./ads-simulation";
import { requireSimulation, simulationEnabled } from "./ads-simulation-server";
import { getPromptPay, hasPromptPay, validSandboxCheckout } from "./promptpay";
import { hasStripeBilling } from "./stripe-policy";
import { promptPayReady } from "./promptpay-2c2p";
import { orderAlert } from "./ads-notification-events";
import { unchangedRenewal, renewalDeadline, renewalHold, withinRenewal } from "./ads-renewal";
import { abandonedRenewals, approveRenewal, ensureRenewalPayable, reconcileContracts, renewalParent, reservedStatuses } from "./ads-renewal-server";
import { orderNotice } from "./customer-notices";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const actionSchema = z.object({
  revision: z.number().int().positive(),
  action: z.enum(["assign", "install", "review_installation", "return_installation", "update_progress", "approve", "reject", "confirm_payment", "gateway_confirm", "gateway_close_refund", "activate", "request_refund", "confirm_refund", "confirm_removed", "sim_verify", "sim_retry", "sim_install", "sim_review", "sim_activate", "sim_update", "sim_cancel"]),
  note: z.string().trim().min(1).max(2000),
  paymentUrl: z.string().max(2000).optional(),
  reference: z.string().trim().min(3).max(200).optional(),
  amount: z.number().int().nonnegative().optional(),
  assigneeId: z.string().min(1).max(100).optional(),
  dueAt: z.string().datetime().optional(),
  proof: z.array(z.object({ slot: z.string().max(60), url: z.string().url().max(2000).refine(v => new URL(v).protocol === "https:") }).strict()).max(72).optional(),
}).strict();
type Action = z.infer<typeof actionSchema>;
export function paymentReady() {
  return process.env.ADS_PAYMENTS_ENABLED === "true" && !!process.env.ADS_PAYMENT_HOSTS;
}
export function allowedPaymentUrl(value: string) {
  try {
    const url = new URL(value);
    const hosts = (process.env.ADS_PAYMENT_HOSTS || "").split(",").map(s => s.trim()).filter(Boolean);
    return paymentReady() && url.protocol === "https:" && !url.username && !url.password && hosts.includes(url.hostname) && !url.port;
  } catch { return false; }
}
export function publicOrder(order: AdsOrder) {
  const payment = getPromptPay(order.quote);
  const quote = order.quote && typeof order.quote === "object" && !Array.isArray(order.quote) ? { ...order.quote } : order.quote;
  if (quote && typeof quote === "object" && !Array.isArray(quote)) delete quote.promptpay;
  const promptpay = payment ? { provider: payment.provider, environment: payment.environment, state: payment.state, invoiceNo: payment.invoiceNo, reference: payment.reference, receivedAt: payment.receivedAt,
    checkoutUrl: promptPayReady() && order.status === "PAYMENT" && order.holdUntil && order.holdUntil > new Date() && payment.checkoutUrl && validSandboxCheckout(payment.checkoutUrl) ? payment.checkoutUrl : null } : null;
  return { id: order.id, renewalOfId: order.renewalOfId, revision: order.revision, simulation: getSimulation(order.quote), promptpay, status: order.status, quote, amount: order.amount, days: order.days,
    artworkUrl: order.artworkUrl, targetUrl: order.targetUrl, staffNote: order.staffNote,
    fulfillmentStage: order.fulfillmentStage, assignedName: order.assignedName, dueAt: order.dueAt, installationProof: order.installationProof, currentArtwork: order.currentArtwork, refundAmount: order.refundAmount, refundReference: order.refundReference, refundedAt: order.refundedAt,
    paymentUrl: !getSimulation(order.quote) && order.status === "PAYMENT" && order.holdUntil && order.holdUntil > new Date() && order.paymentUrl && allowedPaymentUrl(order.paymentUrl) ? order.paymentUrl : null,
    holdUntil: order.holdUntil, startsAt: order.startsAt, endsAt: order.endsAt, createdAt: order.createdAt };
}
async function expire(tx: Prisma.TransactionClient) {
  await reconcileContracts(tx);
}
export async function locked<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async tx => {
    // Serialize inventory allocation and transitions across every app instance.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(73421, 1)`;
    await expire(tx);
    return fn(tx);
  }, { maxWait: 10000, timeout: 15000 });
}
export function orderWebsite(quote: Prisma.JsonValue): string | null {
  if (!quote || typeof quote !== "object" || Array.isArray(quote)) return null;
  const site = quote.website;
  return site && typeof site === "object" && !Array.isArray(site) && typeof site.id === "string" ? site.id : null;
}
export async function availability(websiteId?: string, renewalOfId?: string, viewerId?: string) {
  return locked(async tx => {
    const parent = renewalOfId ? await renewalParent(tx, renewalOfId, viewerId || "") : null;
    if (parent && (orderWebsite(parent.quote) !== websiteId || Boolean(getSimulation(parent.quote)) !== simulationEnabled())) throw new ApiError("invalid_renewal", 409);
    const rows = await tx.adsOrder.findMany({ where: { ...(parent ? { id: { not: parent.id } } : {}), status: { in: reservedStatuses } }, select: { slots: true, quote: true } });
    const manual=simulationEnabled()?[]:await manualOccupiedSlots(tx,websiteId);
    return occupiedPhysicalSlots([...manual,...new Set(rows.filter(row => Boolean(getSimulation(row.quote)) === simulationEnabled() && (!websiteId || !orderWebsite(row.quote) || orderWebsite(row.quote) === websiteId)).flatMap(row => row.slots))]);
  });
}
export async function createOrder(input: BookingInput, token: string, viewerId: string) {
  tokenSchema.parse(token);
  const tokenHash = hash(token);
  const requestHash = hash(JSON.stringify(input));
  return locked(async tx => {
    const existing = await tx.adsOrder.findUnique({ where: { requestId: input.requestId } });
    if (existing) {
      if (existing.viewerId !== viewerId || existing.tokenHash !== tokenHash || existing.requestHash !== requestHash) throw new ApiError("request_conflict", 409);
      return publicOrder(existing);
    }
    if (Boolean(input.renewalOfId) !== Boolean(input.renewalMode)) throw new ApiError("invalid_renewal", 422);
    const parent = input.renewalOfId ? await renewalParent(tx, input.renewalOfId, viewerId) : null;
    if (parent && (orderWebsite(parent.quote) !== input.websiteId || Boolean(getSimulation(parent.quote)) !== simulationEnabled())) throw new ApiError("invalid_renewal", 409);
    const settings = await tx.servicePageConfig.findUnique({ where: { id: "ads-banner" } });
    const config = settings ? adsPageSchema.parse(settings.config) : defaultAdsPage;
    const website = config.websites.find(site => site.id === input.websiteId && site.enabled);
    if (!website) throw new ApiError("website_unavailable", 422);
    let quote;
    try { quote = quoteBooking(input, config); } catch(error) { throw new ApiError(error instanceof Error&&error.message==="invalid_coupon"?"invalid_coupon":"invalid_slots", 422); }
    if(quote.coupon){
      const coupon=config.coupons.find(c=>c.code===quote.coupon!.code)!;
      const scope=simulationEnabled()?"simulation":"standard";
      const couponWhere={AND:[{quote:{path:["coupon","code"],equals:coupon.code}},{quote:{path:["coupon","scope"],equals:scope}}]};
      const used=await tx.adsOrder.count({where:couponWhere});
      const owned=await tx.adsOrder.count({where:{viewerId,...couponWhere}});
      if(used>=coupon.maxUses||owned)throw new ApiError("coupon_limit",409);
    }
    if (parent && input.renewalMode === "same" && (quote.slots.length !== parent.slots.length || quote.slots.some(slot => !parent.slots.includes(slot)))) throw new ApiError("renewal_slots_changed", 422);
    const renewal = parent ? { mode: input.renewalMode!, previousEndsAt: parent.endsAt!.toISOString(), deadline: renewalDeadline(parent.endsAt!).toISOString(), artworkChanged:false } : null;
    if (quote.amount !== input.expectedAmount) throw new ApiError("price_changed", 409);
    const simulation = simulationEnabled() ? newSimulation(quote.amount) : null;
    {
      const candidates = await tx.adsOrder.findMany({ where: { ...(parent ? { id: { not: parent.id } } : {}), status: { in: reservedStatuses } }, select: { quote: true, slots: true } });
      if (!simulation && adsSlotsOverlap(await manualOccupiedSlots(tx,website.id),quote.slots)) throw new ApiError("slots_unavailable",409);
      if (candidates.some(row => adsSlotsOverlap(row.slots, quote.slots) && Boolean(getSimulation(row.quote)) === Boolean(simulation) && (!orderWebsite(row.quote) || orderWebsite(row.quote) === website.id))) throw new ApiError("slots_unavailable", 409);
    }
    const attachments = input.attachments || [];
    if (attachments.length !== quote.slots.length || new Set(attachments.map(a => a.slot)).size !== quote.slots.length || attachments.some(a => !quote.slots.includes(a.slot))) throw new ApiError("attachments_required",422);
    const files = await Promise.all(attachments.map(async item => {
      const file = await readAttachment(item.fileId);
      if (file.owner !== viewerId || (item.slot.startsWith("video_ad:") ? file.type !== "video/mp4" : !file.type.startsWith("image/"))) throw new ApiError("invalid_attachment",422);
      return { ...item, name:file.name, type:file.type, size:file.size };
    }));
    const count = await tx.adsOrder.count({ where: { createdAt: { gt: new Date(Date.now() - 86400000) }, viewerId } });
    if(parent&&renewal){const parentQuote=parent.quote as Prisma.JsonObject;const original=parent.currentArtwork||parentQuote.attachments;const old=Array.isArray(original)?original:[];renewal.artworkChanged=files.some(f=>!old.some(a=>a&&typeof a==="object"&&!Array.isArray(a)&&a.slot===f.slot&&a.fileId===f.fileId&&a.targetUrl===f.targetUrl));}
    if (count >= 5) throw new ApiError("too_many_orders", 429);
    const order = await tx.adsOrder.create({ data: {
      id: randomUUID(), requestId: input.requestId, tokenHash, requestHash, viewerId, renewalOfId: parent?.id,
      customer: { name: input.name, email: input.email.toLowerCase(), contact: input.contact },
      quote: { ...quote, ...(quote.coupon?{coupon:{...quote.coupon,scope:simulationEnabled()?"simulation":"standard"}}:{}), terms: { version: "ads-2026-11-06", acceptedAt: new Date().toISOString(), renewalGraceHours: 72, renewalStartsFrom: "previous_expiry" }, ...(renewal ? { renewal } : {}), ...(simulation ? { simulation } : {}), attachments: files, website: { id: website.id, name: website.name, url: website.url }, items: [`เว็บไซต์: ${website.name} (${website.url})`, ...quote.items] }, slots: quote.slots, days: input.days, amount: quote.amount,
      artworkUrl: input.artworkUrl, targetUrl: input.targetUrl, note: input.note,
      ...(simulation ? { status: "PAYMENT", holdUntil: renewalHold({ renewal }, new Date(Date.now() + 30 * 60000)) } : {}),
    } });
    await orderAlert(tx, { orderId: order.id, key: `new:${order.id}`, kind: "NEW_ORDER", title: parent ? "คำสั่งซื้อต่ออายุ" : "คำสั่งซื้อใหม่", message: `${input.name} ${parent ? "ต่ออายุ" : "สั่งซื้อ"} ${quote.slots.length} ช่อง ระยะเวลา ${input.days} วัน · ${quote.amount.toLocaleString()} บาท${simulation ? " · รายการจำลอง" : ""}` });
    await orderNotice(tx, order.id, `created:${order.id}`, "รับคำสั่งซื้อแล้ว", "ตรวจสอบยอดและขั้นตอนถัดไปจากรายละเอียดคำสั่งซื้อของคุณ");
    if (simulation) await tx.auditLog.create({ data: { actorRole: "SYSTEM", action: "ads_order_sim_created", resourceType: "ads_order", resourceId: order.id, metadata: { after: "PAYMENT", note: "สร้างคำสั่งซื้อจำลอง · ไม่มีการรับเงินจริง · กันพื้นที่ทดสอบ 30 นาที" } } });
    return publicOrder(order);
  });
}
export async function readOrder(token: string, viewerId?: string) {
  tokenSchema.parse(token);
  return locked(async tx => {
    const order = await tx.adsOrder.findUnique({ where: { tokenHash: hash(token) } });
    if (!order || (order.viewerId && order.viewerId !== viewerId)) throw new ApiError("not_found", 404);
    return publicOrder(order);
  });
}
export async function memberOrders(viewerId: string, cursor?: string) {
  return locked(async tx => {
    const rows = await tx.adsOrder.findMany({ where: { viewerId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    return { orders: rows.slice(0, 50).map(publicOrder), nextCursor: rows.length > 50 ? rows[49]!.id : null };
  });
}
export async function readRenewalInfo(id: string, viewerId: string) {
  return locked(async tx => {
    const order = await tx.adsOrder.findFirst({ where: { id, viewerId } });
    if (!order) throw new ApiError("not_found", 404);
    const pending = await tx.adsOrder.findFirst({ where: { renewalOfId: id, status: { notIn: abandonedRenewals } }, select: { id: true, status: true } });
    const eligible = ["ACTIVE", "GRACE"].includes(order.status) && withinRenewal(order.endsAt) && Boolean(getSimulation(order.quote)) === simulationEnabled();
    const quote = order.quote as Prisma.JsonObject;
    const customer = order.customer as Prisma.JsonObject;
    const sourceFiles = order.currentArtwork || quote.attachments;
    const files = Array.isArray(sourceFiles) ? sourceFiles.flatMap(item => {
      if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.slot !== "string" || typeof item.fileId !== "string" || typeof item.name !== "string" || typeof item.targetUrl !== "string") return [];
      return [{ slot: item.slot, fileId: item.fileId, name: item.name, targetUrl: item.targetUrl }];
    }) : [];
    return { canRenew: eligible && !pending, pending, renewalOfId: order.renewalOfId, deadline: order.endsAt ? renewalDeadline(order.endsAt).toISOString() : null,
      seed: eligible && !pending ? { id, websiteId: orderWebsite(order.quote) || "", slots: order.slots, days: order.days as 30 | 90 | 180, kind: (["slots", "homepage", "video", "everypage", "website"].includes(String(quote.kind)) ? quote.kind : "slots") as BookingInput["kind"], files,
        name: String(customer.name || ""), email: String(customer.email || ""), contact: String(customer.contact || ""), previousEndsAt: order.endsAt!.toISOString() } : null };
  });
}
export async function claimOrder(token: string, viewerId: string) {
  tokenSchema.parse(token);
  return locked(async tx => {
    const order = await tx.adsOrder.findUnique({ where: { tokenHash: hash(token) } });
    if (!order || (order.viewerId && order.viewerId !== viewerId)) throw new ApiError("not_found", 404);
    await tx.adsOrder.update({ where: { id: order.id }, data: { viewerId } });
    return { id: order.id };
  });
}
export async function listOrders(cursor?: string, group: import("./ads-order-groups").OrderGroup = "all", query = "") {
  const { orderGroups } = await import("./ads-order-groups");
  const search = query.trim();
  const searchWhere: Prisma.AdsOrderWhereInput = search ? { id: { contains: search, mode: "insensitive" } } : {};
  return locked(async tx => {
    const rows = await tx.adsOrder.findMany({ where: { ...searchWhere, ...(group === "all" ? {} : { status: { in: orderGroups[group].statuses } }) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 101,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      omit: { tokenHash: true, requestHash: true, requestId: true } });
    const totals = await tx.adsOrder.groupBy({ where: searchWhere, by: ["status"], _count: { _all: true } });
    const counts = Object.fromEntries(Object.entries(orderGroups).map(([key, value]) => [key, totals.reduce((sum, row) => sum + (key === "all" || value.statuses.includes(row.status) ? row._count._all : 0), 0)]));
    return { orders: rows.slice(0, 100), counts, nextCursor: rows.length > 100 ? rows[99]!.id : null };
  });
}
export async function readAdminOrder(id: string) {
  return locked(async tx => {
    const order = await tx.adsOrder.findUnique({ where: { id }, include: { renewals: { where: { status: { notIn: abandonedRenewals } }, select: { id: true, status: true, slots: true } } }, omit: { tokenHash: true, requestHash: true, requestId: true } });
    if (!order) throw new ApiError("not_found", 404);
    const logs = await tx.auditLog.findMany({ where: { resourceType: "ads_order", resourceId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, createdAt: true, action: true, actorRole: true, metadata: true } });
    const events = logs.map(log => {
      const data = log.metadata && typeof log.metadata === "object" && !Array.isArray(log.metadata) ? log.metadata : {};
      return { id: log.id, date: log.createdAt, action: log.action, role: log.actorRole,
        before: typeof data.before === "string" ? data.before : null, after: typeof data.after === "string" ? data.after : null,
        note: typeof data.note === "string" ? data.note : "", reference: typeof data.reference === "string" ? data.reference : null };
    });
    return { order, events };
  });
}
export async function actOnOrder(id: string, input: Action, actor: Actor) {
  return locked(async tx => {
    const order = await tx.adsOrder.findUnique({ where: { id } });
    if (!order) throw new ApiError("not_found", 404);
    if (order.revision !== input.revision) throw new ApiError("revision_conflict", 409);
    if (hasStripeBilling(order.quote) && ["approve", "reject", "confirm_payment", "confirm_refund", "gateway_confirm", "gateway_close_refund"].includes(input.action)) throw new ApiError("stripe_verification_required", 409);
    if (["assign", "install", "review_installation", "return_installation", "update_progress"].includes(input.action)) return fulfillmentAction(tx, order, input, actor);
    if (["request_refund", "sim_cancel", "confirm_removed"].includes(input.action) && await tx.adsOrder.findFirst({ where: { renewalOfId: id, status: { in: ["REVIEW", "PAYMENT", "PAYMENT_REVIEW", "PAID", "SCHEDULED"] } } })) throw new ApiError("renewal_pending", 409);
    if (getSimulation(order.quote)) return actOnSimulation(tx, order, input, actor);
    if (input.action.startsWith("sim_")) throw new ApiError("simulation_order_required", 409);
    if (hasPromptPay(order.quote) && ["approve", "reject", "confirm_payment", "confirm_refund"].includes(input.action)) throw new ApiError("gateway_verification_required", 409);
    const data: Prisma.AdsOrderUpdateInput = { staffNote: input.note, revision: { increment: 1 } };
    switch (input.action) {
      case "gateway_close_refund": {
        if (!getPromptPay(order.quote) || order.status !== "REFUND_REQUIRED") throw new ApiError("invalid_transition", 409);
        data.status = "REFUNDED";
        break;
      }
      case "gateway_confirm": {
        const payment = getPromptPay(order.quote);
        if (!payment || order.status !== "PAYMENT_REVIEW" || payment.state !== "received" || !payment.reference || !payment.receivedAt || !order.paymentReference || payment.amountSatang !== order.amount * 100) throw new ApiError("gateway_verification_required", 409);
        data.status = "PAID";
        break;
      }
      case "approve": {
        if (order.status !== "REVIEW") throw new ApiError("invalid_transition", 409);
        await ensureRenewalPayable(tx, order);
        if (!input.paymentUrl || !allowedPaymentUrl(input.paymentUrl)) throw new ApiError("payment_gateway_not_ready", 503);
        const settings = await tx.servicePageConfig.findUnique({ where: { id: "ads-banner" } });
        const config = settings ? adsPageSchema.parse(settings.config) : defaultAdsPage;
        const all = getInventory(config);
        const websiteId = orderWebsite(order.quote);
        if (websiteId && !config.websites.some(site => site.id === websiteId && site.enabled)) throw new ApiError("website_unavailable", 409);
        if (order.slots.some(id => !all.some(s => s.id === id))) throw new ApiError("inventory_changed", 409);
        const candidates = await tx.adsOrder.findMany({ where: { id: { notIn: [id, ...(order.renewalOfId ? [order.renewalOfId] : [])] }, status: { in: reservedStatuses } }, select: { quote: true, slots: true } });
        const manualConflict=adsSlotsOverlap(await manualOccupiedSlots(tx,websiteId??undefined),order.slots);
        const conflict = manualConflict || candidates.some(other => adsSlotsOverlap(other.slots, order.slots) && !getSimulation(other.quote) && (!websiteId || !orderWebsite(other.quote) || orderWebsite(other.quote) === websiteId));
        if (conflict) throw new ApiError("slots_unavailable", 409);
        Object.assign(data, { status: "PAYMENT", paymentUrl: input.paymentUrl, holdUntil: renewalHold(order.quote, new Date(Date.now() + 24 * 3600000)) });
        break;
      }
      case "reject":
        if (order.status !== "REVIEW") throw new ApiError("invalid_transition", 409);
        data.status = "REJECTED"; break;
      case "confirm_payment":
        // No browser return URL is proof of payment. Staff must reconcile the
        // actual provider settlement until a provider-specific webhook exists.
        if (!paymentReady()) throw new ApiError("payment_gateway_not_ready", 503);
        if (!["PAYMENT", "EXPIRED"].includes(order.status) || !input.reference || input.amount !== order.amount) throw new ApiError("payment_mismatch", 409);
        Object.assign(data, { status: order.status === "EXPIRED" ? "REFUND_REQUIRED" : "PAID", paymentReference: input.reference, paymentUrl: null });
        data.quote = { ...(order.quote as Prisma.JsonObject), paymentConfirmedAt: new Date().toISOString() };
        break;
      case "activate":
        if (order.status !== "PAID" || order.startsAt || order.endsAt) throw new ApiError("payment_required", 409);
        if (!unchangedRenewal(order.quote) && (order.fulfillmentStage !== "review" || !order.installationProof)) throw new ApiError("installation_review_required", 409);
        data.fulfillmentStage = "approved";
        Object.assign(data, await approveRenewal(tx, order)); break;
      case "request_refund":
        if (!["PAID", "ACTIVE", "SCHEDULED", "GRACE"].includes(order.status)) throw new ApiError("invalid_transition", 409);
        data.status = "REFUND_REQUIRED"; break;
      case "confirm_refund":
        if (order.status !== "REFUND_REQUIRED" || !input.reference || input.amount !== order.amount) throw new ApiError("refund_evidence_required", 409);
        Object.assign(data, { refundAmount: input.amount, refundReference: input.reference, refundedAt: new Date() });
        data.status = "REFUNDED"; break;
      case "confirm_removed":
        if (order.status !== "REMOVAL_REQUIRED") throw new ApiError("invalid_transition", 409);
        data.status = "COMPLETED"; break;
    }
    const updated = await tx.adsOrder.update({ where: { id }, data });
    await orderNotice(tx, id, `order:${id}:${updated.revision}`, "อัปเดตคำสั่งซื้อ", input.note);
    await tx.auditLog.create({ data: { actorId: actor.id, actorRole: actor.role, action: "ads_order_" + input.action, resourceType: "ads_order", resourceId: id,
      metadata: { before: order.status, after: updated.status, note: input.note, reference: input.reference ?? null, amount: input.amount ?? null, revision: updated.revision } } });
    return { id: updated.id, status: updated.status, revision: updated.revision };
  });
}

export const simulationPaymentSchema = z.object({
  id: z.string().uuid(), revision: z.number().int().positive(),
  action: z.enum(["select", "submit"]),
  method: z.enum(["qr", "usdt_bep20", "usdt_trc20"]).optional(),
  outcome: z.enum(["success", "mismatch", "failed"]).optional(),
}).strict();

export async function readSimulationOrder(id: string, viewerId: string) {
  requireSimulation();
  return locked(async tx => {
    const order = await tx.adsOrder.findFirst({ where: { id, viewerId } });
    if (!order || !getSimulation(order.quote)) throw new ApiError("not_found", 404);
    return publicOrder(order);
  });
}

export async function simulatePayment(input: z.infer<typeof simulationPaymentSchema>, viewerId: string) {
  requireSimulation();
  return locked(async tx => {
    const order = await tx.adsOrder.findFirst({ where: { id: input.id, viewerId } });
    const simulation = order && getSimulation(order.quote);
    if (!order || !simulation) throw new ApiError("not_found", 404);
    if (order.revision !== input.revision) throw new ApiError("revision_conflict", 409);
    if (order.status !== "PAYMENT" || simulation.phase !== "checkout" || !order.holdUntil || order.holdUntil <= new Date()) throw new ApiError("invalid_transition", 409);
    let note: string;
    if (input.action === "select") {
      if (!input.method) throw new ApiError("method_required", 422);
      simulation.method = input.method;
      simulation.receipt = null;
      note = "เลือกช่องทางจำลอง: " + input.method;
    } else {
      if (!simulation.method || !input.outcome) throw new ApiError("method_required", 422);
      simulation.receipt = { id: "SIM-" + randomUUID(), outcome: input.outcome, amountTHB: input.outcome === "success" ? order.amount : input.outcome === "mismatch" ? Math.max(0, order.amount - 1) : 0, submittedAt: new Date().toISOString() };
      simulation.phase = input.outcome === "failed" ? "checkout" : "submitted";
      note = input.outcome === "failed" ? "จำลองการชำระไม่สำเร็จ สามารถลองใหม่ได้" : "ส่งธุรกรรมจำลองให้เจ้าหน้าที่ตรวจสอบ · ไม่มีการโอนเงินจริง";
    }
    const updated = await tx.adsOrder.update({ where: { id: order.id }, data: { quote: { ...(order.quote as Prisma.JsonObject), simulation }, revision: { increment: 1 } } });
    if (input.action === "submit" && input.outcome !== "success") await orderAlert(tx, { orderId: order.id, key: `sim-payment:${simulation.receipt!.id}`, kind: "PAYMENT_ISSUE", title: input.outcome === "failed" ? "ชำระเงินจำลองไม่สำเร็จ" : "ยอดชำระเงินจำลองไม่ตรง", message: "ระบบจำลองพบปัญหาการชำระเงิน กรุณาตรวจสอบคำสั่งซื้อและติดต่อผู้ใช้ ไม่มีการรับเงินจริง" });
    await tx.auditLog.create({ data: { actorRole: "SYSTEM", action: "ads_order_sim_" + input.action, resourceType: "ads_order", resourceId: order.id, metadata: { before: order.status, after: updated.status, note, viewerId, reference: simulation.receipt?.id ?? null } } });
    return publicOrder(updated);
  });
}

async function actOnSimulation(tx: Prisma.TransactionClient, order: AdsOrder, input: Action, actor: Actor) {
  requireSimulation();
  const simulation = getSimulation(order.quote)!;
  const data: Prisma.AdsOrderUpdateInput = { staffNote: input.note, revision: { increment: 1 } };
  const requirePhase = (status: string, phase: string) => {
    if (order.status !== status || simulation.phase !== phase) throw new ApiError("invalid_transition", 409);
  };
  switch (input.action) {
    case "confirm_removed":
      if (order.status !== "REMOVAL_REQUIRED") throw new ApiError("invalid_transition", 409);
      data.status = "COMPLETED";
      break;
    case "sim_verify":
      requirePhase("PAYMENT", "submitted");
      if (!simulation.receipt || simulation.receipt.outcome !== "success" || simulation.receipt.amountTHB !== order.amount) throw new ApiError("payment_mismatch", 409);
      simulation.phase = "verified";
      Object.assign(data, { status: "PAID", paymentReference: simulation.receipt.id, holdUntil: null });
      break;
    case "sim_retry":
      requirePhase("PAYMENT", "submitted");
      simulation.phase = "checkout";
      simulation.receipt = null;
      break;
    case "sim_install": requirePhase("PAID", "verified"); simulation.phase = "installing"; data.fulfillmentStage = "installing"; break;
    case "sim_review": requirePhase("PAID", "installing"); simulation.phase = "approval"; data.fulfillmentStage = "review"; break;
    case "sim_activate":
      if (unchangedRenewal(order.quote) && simulation.phase === "verified") requirePhase("PAID", "verified");
      else requirePhase("PAID", "approval");
      if (order.startsAt || order.endsAt) throw new ApiError("contract_already_started", 409);
      simulation.phase = "active";
      data.fulfillmentStage = "approved";
      Object.assign(data, await approveRenewal(tx, order));
      break;
    case "sim_update":
      if (!["PAID", "ACTIVE", "SCHEDULED", "GRACE"].includes(order.status)) throw new ApiError("invalid_transition", 409);
      break;
    case "sim_cancel":
      if (["REJECTED", "COMPLETED", "REFUNDED"].includes(order.status)) throw new ApiError("invalid_transition", 409);
      Object.assign(data, { status: "REJECTED", holdUntil: null });
      break;
    default: throw new ApiError("simulation_action_required", 409);
  }
  data.quote = { ...(order.quote as Prisma.JsonObject), simulation };
  const updated = await tx.adsOrder.update({ where: { id: order.id }, data });
  await orderNotice(tx, order.id, `order:${order.id}:${updated.revision}`, "อัปเดตคำสั่งซื้อจำลอง", input.note);
  await tx.auditLog.create({ data: { actorId: actor.id, actorRole: actor.role, action: "ads_order_" + input.action, resourceType: "ads_order", resourceId: order.id, metadata: { before: order.status, after: updated.status, phase: simulation.phase, note: "[จำลอง] " + input.note, reference: simulation.receipt?.id ?? null, revision: updated.revision } } });
  return { id: updated.id, status: updated.status, revision: updated.revision };
}

async function fulfillmentAction(tx: Prisma.TransactionClient, order: AdsOrder, input: Action, actor: Actor) {
  if (!["PAID", "ACTIVE", "GRACE", "SCHEDULED"].includes(order.status)) throw new ApiError("invalid_transition", 409);
  const data: Prisma.AdsOrderUpdateInput = { staffNote: input.note, revision: { increment: 1 } };
  const sim = getSimulation(order.quote);
  if (sim) requireSimulation();
  if (input.action === "assign") {
    const user = await tx.user.findUnique({ where: { id: input.assigneeId || actor.id || "" }, select: { id: true, name: true, role: true } });
    if (!user || !["MANAGER", "HEAD"].includes(user.role) || !input.dueAt || Date.parse(input.dueAt) <= Date.now()) throw new ApiError("assignee_or_due_required", 422);
    Object.assign(data, { assignedTo: user.id, assignedName: user.name, dueAt: new Date(input.dueAt) });
  }
  if (input.action === "install") {
    if (order.status !== "PAID" || !order.assignedTo || !order.dueAt || order.fulfillmentStage !== "queued") throw new ApiError("assignment_required", 409);
    data.fulfillmentStage = "installing"; if (sim) sim.phase = "installing";
  }
  if (input.action === "review_installation") {
    if (order.status !== "PAID" || order.fulfillmentStage !== "installing") throw new ApiError("invalid_transition", 409);
    const proof = input.proof || [];
    if (proof.length !== order.slots.length || new Set(proof.map(p => p.slot)).size !== order.slots.length || proof.some(p => !order.slots.includes(p.slot))) throw new ApiError("installation_proof_required", 422);
    data.fulfillmentStage = "review"; data.installationProof = proof; if (sim) sim.phase = "approval";
  }
  if (input.action === "return_installation") {
    if (order.status !== "PAID" || order.fulfillmentStage !== "review") throw new ApiError("invalid_transition", 409);
    data.fulfillmentStage = "installing"; if (sim) sim.phase = "installing";
  }
  if (sim) data.quote = { ...(order.quote as Prisma.JsonObject), simulation: sim };
  const updated = await tx.adsOrder.update({ where: { id: order.id }, data });
  await tx.auditLog.create({ data: { actorId: actor.id, actorRole: actor.role, action: "ads_order_" + input.action, resourceType: "ads_order", resourceId: order.id, metadata: { before: order.status, after: updated.status, stage: updated.fulfillmentStage, note: input.note, assignedTo: updated.assignedTo, dueAt: updated.dueAt?.toISOString() ?? null, proof: input.proof ?? [] } } });
  await orderNotice(tx, order.id, `order:${order.id}:${updated.revision}`, "ความคืบหน้างานของคุณ", input.note);
  return { id: order.id, status: updated.status, revision: updated.revision };
}
