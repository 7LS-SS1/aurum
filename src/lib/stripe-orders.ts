import { createHash } from "node:crypto";
import { Prisma, type StripeOrder } from "@prisma/client";
import type Stripe from "stripe";
import { prisma } from "./prisma";
import { ApiError } from "./api-response";
import type { Actor } from "./authz";
import { stripeAccountCheck, stripeClient, stripeError, stripeSettings } from "./stripe-config";
import { canRetryStripeCreation, hasStripeBilling, safeStripeUrl, verifyStripeTotal, verifyStripeCustomer, type StripeDraft } from "./stripe-policy";
import { getSimulation } from "./ads-simulation";
import { hasPromptPay } from "./promptpay";
import { orderWebsite } from "./ads-orders";
import { ensureRenewalPayable, reservedStatuses } from "./ads-renewal-server";
import { renewalHold } from "./ads-renewal";
import { adsPageSchema, defaultAdsPage } from "./ads-page-config";
import { getInventory } from "./ads-booking";
import { checkoutSettlementTime, fullyRefunded } from "./stripe-evidence";
import { orderAlert } from "./ads-notification-events";
import { orderNotice } from "./customer-notices";

function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async tx => {
    // Same inventory lock as existing Banner operations; no provider calls inside this lock.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(73421, 1)`;
    return fn(tx);
  }, { maxWait: 10000, timeout: 15000 });
}
export function publicStripeOrder(row: StripeOrder & { bannerOrder?: { status: string } | null }) {
  return { id: row.id, viewerId: row.viewerId, kind: row.kind, bannerOrderId: row.bannerOrderId,
    title: row.title, amountSatang: row.amountSatang, mode: row.mode, status: row.status,
    url: row.status === "OPEN" && (!row.expiresAt || row.expiresAt > new Date()) ? safeStripeUrl(row.url, row.mode as "CHECKOUT" | "INVOICE") : null,
    bannerStatus: row.bannerOrder?.status || null, expiresAt: row.expiresAt, paidAt: row.paidAt, createdAt: row.createdAt, lastCheckedAt: row.lastCheckedAt };
}
export async function listStripeOrders(viewerId?: string) {
  return (await prisma.stripeOrder.findMany({ where: viewerId ? { viewerId } : {}, include: { bannerOrder: { select: { status: true } } }, orderBy: { createdAt: "desc" }, take: 100 })).map(publicStripeOrder);
}
export async function createStripeDraft(input: StripeDraft, actor: Actor) {
  const config = stripeSettings(true);
  const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return transaction(async tx => {
    const existing = await tx.stripeOrder.findUnique({ where: { requestId: input.requestId } });
    if (existing) {
      if (existing.requestHash !== requestHash) throw new ApiError("request_conflict", 409);
      return publicStripeOrder(existing);
    }
    const banner = input.kind === "BANNER" ? await tx.adsOrder.findUnique({ where: { id: input.bannerOrderId } }) : null;
    if (input.kind === "BANNER" && (!banner || !banner.viewerId || banner.status !== "REVIEW" || getSimulation(banner.quote) || hasPromptPay(banner.quote) || hasStripeBilling(banner.quote) || banner.paymentUrl || banner.paymentReference)) throw new ApiError("banner_payment_conflict", 409);
    const viewerId = input.kind === "VIDEO" ? input.viewerId : banner!.viewerId!;
    const viewer = await tx.viewer.findUnique({ where: { id: viewerId } });
    if (!viewer || viewer.suspended || !viewer.email) throw new ApiError("customer_email_required", 422);
    const amount = input.kind === "VIDEO" ? input.amountSatang : banner!.amount * 100;
    if (!Number.isSafeInteger(amount) || amount < 1000 || amount > 99999999) throw new ApiError("invalid_amount", 422);
    const row = await tx.stripeOrder.create({ data: { requestId: input.requestId, requestHash, viewerId, kind: input.kind,
      sourceKey: input.kind === "BANNER" ? `banner:${banner!.id}` : `video:${input.requestId}`,
      bannerOrderId: banner?.id, title: input.kind === "VIDEO" ? input.title : `Banner ${banner!.id}`,
      amountSatang: amount, mode: input.mode, accountId: config.accountId } });
    if (banner) await tx.adsOrder.update({ where: { id: banner.id }, data: { quote: { ...(banner.quote as Prisma.JsonObject), stripeBillingId: row.id }, revision: { increment: 1 } } });
    await tx.auditLog.create({ data: { actorId: actor.id, actorRole: actor.role, action: "stripe_draft_created", resourceType: "stripe_order", resourceId: row.id, metadata: { kind: row.kind, amountSatang: amount, mode: row.mode, sandbox: true } } });
    return publicStripeOrder(row);
  });
}

async function reserveBanner(tx: Prisma.TransactionClient, row: StripeOrder, expiresAt: Date) {
  if (!row.bannerOrderId) return expiresAt;
  const order = await tx.adsOrder.findUniqueOrThrow({ where: { id: row.bannerOrderId } });
  if (order.status !== "REVIEW" || hasPromptPay(order.quote) || order.paymentUrl || order.paymentReference || order.amount * 100 !== row.amountSatang) throw new ApiError("banner_payment_conflict", 409);
  await ensureRenewalPayable(tx, order);
  const settings = await tx.servicePageConfig.findUnique({ where: { id: "ads-banner" } });
  const page = settings ? adsPageSchema.parse(settings.config) : defaultAdsPage;
  const site = orderWebsite(order.quote);
  if (!site || !page.websites.some(s => s.id === site && s.enabled)) throw new ApiError("website_unavailable", 409);
  const inventory = getInventory(page);
  if (!order.slots.length || order.slots.some(s => !inventory.some(i => i.id === s))) throw new ApiError("inventory_changed", 409);
  const others = await tx.adsOrder.findMany({ where: { id: { notIn: [order.id, ...(order.renewalOfId ? [order.renewalOfId] : [])] }, status: { in: reservedStatuses }, slots: { hasSome: order.slots } }, select: { quote: true } });
  if (others.some(o => !getSimulation(o.quote) && (!orderWebsite(o.quote) || orderWebsite(o.quote) === site))) throw new ApiError("slots_unavailable", 409);
  const hold = renewalHold(order.quote, expiresAt);
  if (hold.getTime() < Date.now() + 31 * 60000) throw new ApiError("payment_window_too_short", 409);
  await tx.adsOrder.update({ where: { id: order.id }, data: { status: "PAYMENT", holdUntil: hold, revision: { increment: 1 } } });
  return hold;
}

export async function prepareStripePayment(id: string, viewerId?: string) {
  const owned = await prisma.stripeOrder.findFirst({ where: { id, ...(viewerId ? { viewerId } : {}) }, select: { id: true } });
  if (!owned) throw new ApiError("not_found", 404);
  stripeSettings(true);
  const { client, settings } = stripeClient();
  try {
    await stripeAccountCheck(client, settings.accountId);
    const row = await transaction(async tx => {
      const item = await tx.stripeOrder.findFirst({ where: { id, ...(viewerId ? { viewerId } : {}) } });
      if (!item) throw new ApiError("not_found", 404);
      if (item.accountId !== settings.accountId) throw new ApiError("stripe_account_mismatch", 409);
      if (!["DRAFT", "CREATING"].includes(item.status)) return item;
      if (!canRetryStripeCreation(item.startedAt, item.remoteId)) throw new ApiError("stripe_creation_needs_reconciliation", 409);
      if (item.status === "CREATING") return item;
      // Invoice terms are one day; Checkout holds are one hour. Persist once for idempotent retries.
      const expiresAt = await reserveBanner(tx, item, new Date(Date.now() + (item.mode === "CHECKOUT" ? 3600000 : 86400000)));
      return tx.stripeOrder.update({ where: { id }, data: { status: "CREATING", startedAt: new Date(), expiresAt } });
    });
    if (!["DRAFT", "CREATING"].includes(row.status)) return publicStripeOrder(row);
    if (row.remoteId) return publicStripeOrder(row); // Resume through invoice finalization/reconciliation, never create twice.
    if (row.expiresAt!.getTime() < Date.now() + 31 * 60000) throw new ApiError("stripe_creation_needs_reconciliation", 409);
    const viewer = await prisma.viewer.findUniqueOrThrow({ where: { id: row.viewerId } });
    const customerId = row.customerId || (await client.customers.create({ email: viewer.email!, name: viewer.displayName,
      metadata: { aurumOrderId: row.id } }, { idempotencyKey: `aurum:${row.id}:customer` })).id;
    await prisma.stripeOrder.update({ where: { id }, data: { customerId } });
    const metadata = { aurumOrderId: row.id, aurumKind: row.kind };
    if (row.mode === "CHECKOUT") {
      const session = await client.checkout.sessions.create({ mode: "payment", customer: customerId,
        client_reference_id: id, metadata, payment_intent_data: { metadata },
        integration_identifier: "aurum_services_mqxtnrvp",
        line_items: [{ quantity: 1, price_data: { currency: "thb", unit_amount: row.amountSatang, product_data: { name: row.title } } }],
        success_url: `${settings.origin}/account/payments?result=returned&order_id=${row.id}`, cancel_url: `${settings.origin}/account/payments`,
        expires_at: Math.floor(row.expiresAt!.getTime() / 1000),
      }, { idempotencyKey: `aurum:${id}:checkout` });
      verifyStripeTotal(row, { livemode: session.livemode, currency: session.currency, total: session.amount_total, metadata: session.metadata });
      const updated = await transaction(async tx => {
        const fresh = await tx.stripeOrder.findUniqueOrThrow({ where: { id } });
        return tx.stripeOrder.update({ where: { id }, data: { remoteId: session.id,
          ...(fresh.status === "CREATING" ? { status: "OPEN", url: safeStripeUrl(session.url, "CHECKOUT") } : {}) } });
      });
      return publicStripeOrder(updated);
    }
    // Explicit invoice association excludes unrelated pending invoice items.
    const invoice = await client.invoices.create({ customer: customerId, currency: "thb", metadata,
      collection_method: "send_invoice", auto_advance: false, due_date: Math.floor(row.expiresAt!.getTime() / 1000),
      pending_invoice_items_behavior: "exclude" }, { idempotencyKey: `aurum:${id}:invoice` });
    await client.invoiceItems.create({ customer: customerId, invoice: invoice.id, currency: "thb", amount: row.amountSatang, description: row.title }, { idempotencyKey: `aurum:${id}:line` });
    const updated = await prisma.stripeOrder.update({ where: { id }, data: { remoteId: invoice.id } });
    return publicStripeOrder(updated); // Draft review remains required; no emails are sent.
  } catch (error) { stripeError(error); }
}

export async function finalizeStripeInvoice(id: string) {
  stripeSettings(true);
  const { client, settings } = stripeClient();
  try {
    await stripeAccountCheck(client, settings.accountId);
    const row = await prisma.stripeOrder.findUniqueOrThrow({ where: { id } });
    if (row.accountId !== settings.accountId || row.mode !== "INVOICE" || !row.remoteId || !["CREATING", "OPEN"].includes(row.status)) throw new ApiError("invalid_transition", 409);
    if (!row.expiresAt || row.expiresAt <= new Date()) throw new ApiError("payment_expired", 409);
    const draft = await client.invoices.retrieve(row.remoteId);
    verifyStripeCustomer(row, draft.customer);
    verifyStripeTotal(row, { livemode: draft.livemode, currency: draft.currency, total: draft.total, metadata: draft.metadata });
    if (draft.status === "draft") await client.invoices.finalizeInvoice(draft.id, { auto_advance: false }, { idempotencyKey: `aurum:${id}:finalize` });
    return await reconcileStripeOrder(id);
  } catch (error) { stripeError(error); }
}

export async function reconcileStripeOrder(id: string, viewerId?: string, event?: Stripe.Event) {
  const { client, settings } = stripeClient();
  try {
    const row = await prisma.stripeOrder.findFirst({ where: { id, ...(viewerId ? { viewerId } : {}) } });
    if (!row) throw new ApiError("not_found", 404);
    if (row.accountId !== settings.accountId) throw new ApiError("stripe_account_mismatch", 409);
    if (!row.remoteId) return publicStripeOrder(row);
    await stripeAccountCheck(client, settings.accountId);
    let paid = false, status = row.status, url: string | null = null, paymentIntentId: string | null = null;
    let paidAt: Date | null = null;
    if (row.mode === "CHECKOUT") {
      const session = await client.checkout.sessions.retrieve(row.remoteId, { expand: ["payment_intent.latest_charge"] });
      verifyStripeCustomer(row, session.customer);
      verifyStripeTotal(row, { livemode: session.livemode, currency: session.currency, total: session.amount_total, metadata: session.metadata });
      const pi = typeof session.payment_intent === "object" ? session.payment_intent : null;
      const charge = pi && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
      paid = session.payment_status === "paid" && pi?.status === "succeeded" && pi.amount_received === row.amountSatang && pi.currency === "thb" && !pi.livemode;
      paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : pi?.id || null;
      paidAt = paid ? await checkoutSettlementTime(client, row, pi!.id, event) : null;
      status = await fullyRefunded(client, charge, row.amountSatang) ? "REFUNDED" : charge && (charge.refunded || charge.amount_refunded > 0 || charge.disputed) ? "REVIEW" : paid ? "PAID" : session.status === "expired" ? "EXPIRED" : "OPEN";
      url = safeStripeUrl(session.url, "CHECKOUT");
    } else {
      let invoice = await client.invoices.retrieve(row.remoteId);
      verifyStripeCustomer(row, invoice.customer);
      verifyStripeTotal(row, { livemode: invoice.livemode, currency: invoice.currency, total: invoice.total, metadata: invoice.metadata });
      if (invoice.status === "open" && invoice.amount_paid === 0 && row.expiresAt && row.expiresAt <= new Date()) {
        try { await client.invoices.voidInvoice(invoice.id, {}, { idempotencyKey: `aurum:${id}:expire` }); }
        catch {
          // Payment may win the race. Only an authoritative paid/void state resolves it.
          const latest = await client.invoices.retrieve(invoice.id);
          if (!["paid", "void"].includes(latest.status || "")) throw new ApiError("stripe_expiry_needs_reconciliation", 409);
        }
        invoice = await client.invoices.retrieve(invoice.id);
        verifyStripeCustomer(row, invoice.customer);
        verifyStripeTotal(row, { livemode: invoice.livemode, currency: invoice.currency, total: invoice.total, metadata: invoice.metadata });
      }
      // A manually marked-paid invoice is NOT sufficient proof of a captured payment.
      const payments = await client.invoicePayments.list({ invoice: invoice.id, status: "paid", limit: 100 });
      const payment = payments.data.length === 1 && !payments.has_more ? payments.data[0] : null;
      const intent = payment?.payment.type === "payment_intent" ? payment.payment.payment_intent : null;
      const pi = intent ? await client.paymentIntents.retrieve(typeof intent === "string" ? intent : intent.id, { expand: ["latest_charge"] }) : null;
      const charge = pi && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
      paid = invoice.status === "paid" && invoice.amount_paid === row.amountSatang && payment?.amount_paid === row.amountSatang && !payment.livemode && pi?.status === "succeeded" && !pi.livemode && pi.amount_received === row.amountSatang && pi.currency === "thb";
      paymentIntentId = pi?.id || null;
      status = await fullyRefunded(client, charge, row.amountSatang) ? "REFUNDED" : invoice.post_payment_credit_notes_amount > 0 || invoice.pre_payment_credit_notes_amount > 0 || (charge && (charge.refunded || charge.amount_refunded > 0 || charge.disputed)) || (invoice.status === "paid" && !paid) ? "REVIEW" : paid ? "PAID" : invoice.status === "void" ? "VOID" : invoice.status === "uncollectible" ? "REVIEW" : invoice.status === "draft" ? (row.expiresAt && row.expiresAt <= new Date() ? "EXPIRED" : "CREATING") : "OPEN";
      paidAt = invoice.status_transitions.paid_at ? new Date(invoice.status_transitions.paid_at * 1000) : null;
      url = safeStripeUrl(invoice.hosted_invoice_url, "INVOICE");
    }
    return transaction(async tx => {
      const fresh = await tx.stripeOrder.findUniqueOrThrow({ where: { id } });
      // A stale open/expired response cannot overwrite an observed settled/review state.
      if ((fresh.status === "REFUNDED" && status !== "REVIEW") || (["PAID", "REVIEW"].includes(fresh.status) && !["REVIEW", "REFUNDED"].includes(status))) status = fresh.status;
      if (paid && !fresh.paidAt && row.bannerOrderId) {
        const banner = await tx.adsOrder.findUniqueOrThrow({ where: { id: row.bannerOrderId } });
        const other = await tx.adsOrder.findMany({ where: { id: { notIn: [banner.id, ...(banner.renewalOfId ? [banner.renewalOfId] : [])] }, status: { in: reservedStatuses }, slots: { hasSome: banner.slots } }, select: { quote: true } });
        const site = orderWebsite(banner.quote);
        const conflict = other.some(o => !getSimulation(o.quote) && (!orderWebsite(o.quote) || orderWebsite(o.quote) === site));
        const timely = !!paidAt && !!banner.holdUntil && paidAt < banner.holdUntil && banner.amount * 100 === row.amountSatang;
        const parent = banner.renewalOfId ? await tx.adsOrder.findUnique({ where: { id: banner.renewalOfId } }) : null;
        const parentValid = !banner.renewalOfId || !!parent && ["ACTIVE", "GRACE"].includes(parent.status);
        const next = status === "PAID" && timely && !conflict && parentValid && ["PAYMENT", "EXPIRED"].includes(banner.status) ? "PAYMENT_REVIEW" : "REFUND_REQUIRED";
        if (next === "REFUND_REQUIRED" && status !== "REFUNDED") status = "REVIEW";
        await tx.adsOrder.update({ where: { id: banner.id }, data: { status: next, holdUntil: null, paymentReference: `stripe:sandbox:${row.accountId}:${row.remoteId}`, revision: { increment: 1 }, quote: { ...(banner.quote as Prisma.JsonObject), stripePaid: true, paymentConfirmedAt: (paidAt || new Date()).toISOString() } } });
      }
      if (["REVIEW", "REFUNDED"].includes(status) && row.bannerOrderId) {
        await tx.adsOrder.updateMany({ where: { id: row.bannerOrderId, status: { in: ["PAYMENT", "PAYMENT_REVIEW", "PAID", "ACTIVE", "SCHEDULED", "GRACE"] } }, data: { status: "REFUND_REQUIRED", holdUntil: null, revision: { increment: 1 } } });
      }
      if (["EXPIRED", "VOID"].includes(status) && row.bannerOrderId) {
        await tx.adsOrder.updateMany({ where: { id: row.bannerOrderId, status: "PAYMENT" }, data: { status: "EXPIRED", holdUntil: null, revision: { increment: 1 } } });
      }
      const updated = await tx.stripeOrder.update({ where: { id }, data: { status, url: status === "OPEN" ? url : null, lastCheckedAt: new Date(), paymentIntentId: paymentIntentId || fresh.paymentIntentId, ...(paid && !fresh.paidAt ? { paidAt: paidAt || new Date() } : {}) } });
      if (fresh.status !== updated.status) await tx.auditLog.create({ data: { actorRole: "SYSTEM", action: "stripe_payment_reconciled", resourceType: "stripe_order", resourceId: id, metadata: { before: fresh.status, after: updated.status, sandbox: true } } });
      if (fresh.status !== updated.status && row.bannerOrderId) {
        await orderNotice(tx, row.bannerOrderId, `stripe:${id}:${updated.status}`, "อัปเดตการชำระเงิน", updated.status === "PAID" ? "ยืนยันยอดชำระแล้ว รอทีมงานตรวจรับคำสั่งซื้อ" : updated.status === "REFUNDED" ? "Stripe ยืนยันคืนเงินครบแล้ว ทีมงานจะตรวจการปิดบริการ" : "สถานะการชำระเงินเปลี่ยนแปลง กรุณาตรวจรายละเอียดคำสั่งซื้อ");
        if (["REVIEW", "REFUNDED"].includes(updated.status)) await orderAlert(tx, { orderId: row.bannerOrderId, key: `stripe-review:${id}:${updated.status}`, kind: "PAYMENT_ISSUE", title: "ตรวจสอบรายการ Stripe", message: updated.status === "REFUNDED" ? "คืนเงินครบแล้ว ตรวจการนำป้ายออกก่อนปิดงานและคืนพื้นที่" : "ตรวจยอดชำระ การคืนเงิน และสิทธิ์จองก่อนดำเนินงานต่อ" });
      }
      return publicStripeOrder(updated);
    });
  } catch (error) { stripeError(error); }
}

export async function handleStripeEvent(event: Stripe.Event) {
  if (event.livemode || event.account) throw new ApiError("stripe_event_account_or_mode_mismatch", 400);
  const supported = new Set(["payment_intent.succeeded", "checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired", "invoice.finalized", "invoice.paid", "invoice.payment_failed", "invoice.voided", "invoice.marked_uncollectible", "credit_note.created", "charge.refunded", "charge.dispute.created", "refund.updated", "refund.failed"]);
  if (!supported.has(event.type)) return { received: true, ignored: true };
  if (await prisma.stripeEvent.findUnique({ where: { id: event.id } })) return { received: true, duplicate: true };
  const obj = event.data.object as unknown as { id: string; metadata?: Record<string,string>; invoice?: string; payment_intent?: string; charge?: string };
  let row = obj.metadata?.aurumOrderId ? await prisma.stripeOrder.findUnique({ where: { id: obj.metadata.aurumOrderId } }) : null;
  if (!row) row = await prisma.stripeOrder.findFirst({ where: { OR: [{ remoteId: obj.invoice || obj.id }, ...(obj.payment_intent ? [{ paymentIntentId: obj.payment_intent }] : [])] } });
  if (!row && obj.payment_intent) {
    const { client } = stripeClient();
    const payments = await client.invoicePayments.list({ payment: { type: "payment_intent", payment_intent: obj.payment_intent }, limit: 100 });
    const invoiceIds = payments.data.map(p => typeof p.invoice === "string" ? p.invoice : p.invoice.id);
    row = await prisma.stripeOrder.findFirst({ where: { remoteId: { in: invoiceIds } } });
  }
  if (!row) return { received: true, ignored: true };
  // Recovery for a webhook arriving after provider creation but before remote ID persistence.
  if (!row.remoteId && obj.metadata?.aurumOrderId && ((row.mode === "CHECKOUT" && obj.id.startsWith("cs_test_")) || (row.mode === "INVOICE" && obj.id.startsWith("in_")))) {
    await prisma.stripeOrder.updateMany({ where: { id: row.id, remoteId: null }, data: { remoteId: obj.id } });
  }
  if (!row.remoteId && !obj.id.startsWith("cs_test_") && !obj.id.startsWith("in_")) throw new ApiError("stripe_creation_needs_reconciliation", 503);
  await reconcileStripeOrder(row.id, undefined, event);
  // ON CONFLICT DO NOTHING is atomic even when two webhook deliveries finish together.
  await prisma.stripeEvent.createMany({ data: [{ id: event.id, type: event.type }], skipDuplicates: true });
  return { received: true };
}

export async function confirmStripeBanner(id: string, actor: Actor) {
  // Check Stripe again immediately before staff acceptance; no browser payment claims are trusted.
  await reconcileStripeOrder(id);
  return transaction(async tx => {
    const row = await tx.stripeOrder.findUniqueOrThrow({ where: { id } });
    if (row.status !== "PAID" || !row.paidAt || !row.bannerOrderId) throw new ApiError("stripe_verification_required", 409);
    const banner = await tx.adsOrder.findUniqueOrThrow({ where: { id: row.bannerOrderId } });
    if (banner.status === "PAID") return publicStripeOrder(row);
    if (banner.status !== "PAYMENT_REVIEW" || banner.amount * 100 !== row.amountSatang) throw new ApiError("invalid_transition", 409);
    await tx.adsOrder.update({ where: { id: banner.id }, data: { status: "PAID", revision: { increment: 1 } } });
    await tx.auditLog.create({ data: { actorId: actor.id, actorRole: actor.role, action: "stripe_banner_confirmed", resourceType: "ads_order", resourceId: banner.id, metadata: { stripeOrderId: id, sandbox: true } } });
    return publicStripeOrder(row);
  });
}

export async function closeStripeBannerRefund(id: string, actor: Actor, removalConfirmed: boolean) {
  if (!removalConfirmed) throw new ApiError("stripe_removal_confirmation_required", 422);
  await reconcileStripeOrder(id);
  return transaction(async tx => {
    const row = await tx.stripeOrder.findUniqueOrThrow({ where: { id } });
    if (row.status !== "REFUNDED" || !row.bannerOrderId) throw new ApiError("stripe_refund_not_complete", 409);
    const banner = await tx.adsOrder.findUniqueOrThrow({ where: { id: row.bannerOrderId } });
    if (banner.status === "REFUNDED") return publicStripeOrder(row);
    if (banner.status !== "REFUND_REQUIRED") throw new ApiError("invalid_transition", 409);
    if (await tx.adsOrder.findFirst({ where: { renewalOfId: banner.id, status: { in: ["REVIEW", "PAYMENT", "PAYMENT_REVIEW", "PAID", "SCHEDULED"] } } })) throw new ApiError("renewal_pending", 409);
    await tx.adsOrder.update({ where: { id: banner.id }, data: { status: "REFUNDED", holdUntil: null, refundAmount: banner.amount, refundReference: `stripe:refund:${row.accountId}:${row.remoteId}`, refundedAt: new Date(), revision: { increment: 1 } } });
    await tx.auditLog.create({ data: { actorId: actor.id, actorRole: actor.role, action: "stripe_refund_closed", resourceType: "ads_order", resourceId: banner.id, metadata: { stripeOrderId: id, removalConfirmed: true, sandbox: true } } });
    await orderNotice(tx, banner.id, `stripe-refund-closed:${id}`, "ปิดรายการคืนเงินแล้ว", "ตรวจยอดคืนครบและยืนยันการนำป้ายออกแล้ว ปิดบริการและคืนพื้นที่เรียบร้อย");
    return publicStripeOrder(row);
  });
}
