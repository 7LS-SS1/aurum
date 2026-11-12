import { getTransfer } from "./bank-transfer";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { ApiError } from "./api-response";
import { locked, orderWebsite, publicOrder } from "./ads-orders";
import { getPromptPay, hasPromptPay, type PromptPay } from "./promptpay";
import { createPromptPayCheckout, inquirePromptPay, promptPayConfig, verifyGatewayJwt, verifiedPaymentReference } from "./promptpay-2c2p";
import { getSimulation } from "./ads-simulation";
import { hasStripeBilling } from "./stripe-policy";
import { adsPageSchema, defaultAdsPage } from "./ads-page-config";
import { getInventory } from "./ads-booking";
import { orderAlert } from "./ads-notification-events";
import { renewalHold } from "./ads-renewal";
import { ensureRenewalPayable, reservedStatuses } from "./ads-renewal-server";
import { gatewayPaymentTime } from "./gateway-payment-time";
import { orderNotice } from "./customer-notices";

export async function readPromptPayOrder(id: string, viewerId: string) {
  return locked(async tx => {
    const order = await tx.adsOrder.findFirst({ where: { id, viewerId } });
    if (!order || getSimulation(order.quote)) throw new ApiError("not_found", 404);
    return publicOrder(order);
  });
}

export async function startPromptPay(id: string, viewerId: string) {
  const config = promptPayConfig();
  const reservation = await locked(async tx => {
    const order = await tx.adsOrder.findFirst({ where: { id, viewerId } });
    if (!order || getSimulation(order.quote)) throw new ApiError("not_found", 404);
    // One durable intent per order. An uncertain response must be reconciled,
    // never retried by creating a second invoice/charge.
    if (getTransfer(order.quote)) throw new ApiError("bank_transfer_already_assigned",409);
    if (hasStripeBilling(order.quote)) throw new ApiError("stripe_payment_already_assigned", 409);
    if (hasPromptPay(order.quote)) return { existing: true as const, order, payment: getPromptPay(order.quote) };
    if (order.status !== "REVIEW" || order.paymentUrl || order.amount <= 0) throw new ApiError("invalid_transition", 409);
    await ensureRenewalPayable(tx, order);
    const settings = await tx.servicePageConfig.findUnique({ where: { id: "ads-banner" } });
    const page = settings ? adsPageSchema.parse(settings.config) : defaultAdsPage;
    const site = orderWebsite(order.quote);
    if (!site || !page.websites.some(s => s.id === site && s.enabled)) throw new ApiError("website_unavailable", 409);
    const inventory = getInventory(page);
    if (!order.slots.length || order.slots.some(slot => !inventory.some(s => s.id === slot))) throw new ApiError("inventory_changed", 409);
    const other = await tx.adsOrder.findMany({ where: { id: { notIn: [id, ...(order.renewalOfId ? [order.renewalOfId] : [])] }, slots: { hasSome: order.slots }, status: { in: reservedStatuses } }, select: { quote: true } });
    if (other.some(row => !getSimulation(row.quote) && (!orderWebsite(row.quote) || orderWebsite(row.quote) === site))) throw new ApiError("slots_unavailable", 409);
    const invoiceNo = createHash("sha256").update(`promptpay:${id}`).digest("hex").slice(0, 20);
    if (await tx.adsOrder.findFirst({ where: { quote: { path: ["promptpay", "invoiceNo"], equals: invoiceNo } }, select: { id: true } })) throw new ApiError("invoice_conflict", 409);
    const payment: PromptPay = { version: 1, provider: "2c2p", environment: "sandbox", merchantID: config.merchantID, invoiceNo, amountSatang: order.amount * 100, currency: "THB", state: "creating", createdAt: new Date().toISOString(), checkoutUrl: null, reference: null, receivedAt: null };
    const updated = await tx.adsOrder.update({ where: { id }, data: { status: "PAYMENT", holdUntil: renewalHold(order.quote, new Date(Date.now() + 30 * 60000)), revision: { increment: 1 }, quote: { ...(order.quote as Prisma.JsonObject), promptpay: payment } } });
    await tx.auditLog.create({ data: { actorRole: "SYSTEM", action: "ads_order_promptpay_created", resourceType: "ads_order", resourceId: id, metadata: { before: order.status, after: "PAYMENT", note: "สร้างรายการ QR PromptPay Sandbox และกันพื้นที่ 30 นาที", reference: invoiceNo } } });
    return { existing: false as const, order: updated, payment };
  });
  if (reservation.existing) return publicOrder(reservation.order);
  let checkoutUrl: string;
  try { checkoutUrl = await createPromptPayCheckout(id, reservation.payment, config); }
  catch (error) {
    await locked(async tx => {
      const order = await tx.adsOrder.findUniqueOrThrow({ where: { id } });
      const payment = getPromptPay(order.quote);
      if (payment?.state === "creating") {
        await tx.adsOrder.update({ where: { id }, data: { quote: { ...(order.quote as Prisma.JsonObject), promptpay: { ...payment, state: "unknown" } }, revision: { increment: 1 } } });
        await tx.auditLog.create({ data: { actorRole: "SYSTEM", action: "ads_order_promptpay_uncertain", resourceType: "ads_order", resourceId: id, metadata: { before: order.status, after: order.status, note: "ยังยืนยันผลสร้าง QR ไม่ได้ ต้องตรวจสอบกับ Gateway ก่อน ห้ามสร้างรายการชำระซ้ำ" } } });
        await orderAlert(tx, { orderId: id, key: `payment-create:${payment.invoiceNo}`, kind: "PAYMENT_ISSUE", title: "ยังยืนยันผลสร้าง QR ไม่ได้", message: "ตรวจ Inquiry ของรายการเดิมกับ Gateway ก่อนให้ลูกค้าทำรายการใหม่ เพื่อป้องกันชำระซ้ำ" });
      }
    });
    throw error;
  }
  return locked(async tx => {
    const order = await tx.adsOrder.findUniqueOrThrow({ where: { id } });
    const payment = getPromptPay(order.quote);
    if (!payment || payment.state !== "creating") return publicOrder(order);
    const updated = await tx.adsOrder.update({ where: { id }, data: { quote: { ...(order.quote as Prisma.JsonObject), promptpay: { ...payment, state: "ready", checkoutUrl } }, revision: { increment: 1 } } });
    return publicOrder(updated);
  });
}

export async function reconcilePromptPay(id: string, viewerId?: string) {
  try { return await reconcilePromptPayCore(id, viewerId); }
  catch (error) {
    if (error instanceof ApiError && ["gateway_payment_mismatch", "gateway_duplicate_payment", "gateway_unavailable", "gateway_invalid_response", "invalid_gateway_signature"].includes(error.message)) {
      await prisma.$transaction(tx => orderAlert(tx, { orderId: id, key: `payment-check:${id}:${error.message}`, kind: "PAYMENT_ISSUE", title: "ตรวจสอบการชำระเงินกับ Gateway ไม่สำเร็จ", message: `รหัสปัญหา: ${error.message} · ยังไม่ยืนยันยอด โปรดตรวจสอบธุรกรรมกับผู้ให้บริการ` }));
    }
    throw error;
  }
}
async function reconcilePromptPayCore(id: string, viewerId?: string) {
  const config = promptPayConfig();
  const order = await prisma.adsOrder.findFirst({ where: { id, ...(viewerId ? { viewerId } : {}) } });
  const payment = order && getPromptPay(order.quote);
  if (!order || !payment || getSimulation(order.quote)) throw new ApiError("not_found", 404);
  const response = await inquirePromptPay(payment, config);
  const reference = verifiedPaymentReference(response, payment);
  if (!reference) return { received: false, order: viewerId ? await readPromptPayOrder(id, viewerId) : publicOrder(order) };
  return locked(async tx => {
    const fresh = await tx.adsOrder.findUniqueOrThrow({ where: { id } });
    const snapshot = getPromptPay(fresh.quote);
    if (!snapshot || snapshot.invoiceNo !== payment.invoiceNo || snapshot.amountSatang !== fresh.amount * 100) throw new ApiError("gateway_payment_mismatch", 409);
    const paymentReference = `2c2p:sandbox:${payment.merchantID}:${reference}`;
    if (snapshot.state === "received") {
      if (fresh.paymentReference !== paymentReference) throw new ApiError("gateway_duplicate_payment", 409);
      return { received: true, order: publicOrder(fresh) };
    }
    const duplicate = await tx.adsOrder.findUnique({ where: { paymentReference }, select: { id: true } });
    if (duplicate && duplicate.id !== id) throw new ApiError("gateway_duplicate_payment", 409);
    const providerPaidAt=gatewayPaymentTime(response.transactionDateTime);
    const paidTime=providerPaidAt?new Date(providerPaidAt):new Date();
    const timely=!!fresh.holdUntil&&paidTime<fresh.holdUntil&&paidTime.getTime()>=Date.parse(snapshot.createdAt)-1000;
    const other=await tx.adsOrder.findMany({where:{id:{notIn:[id,...(fresh.renewalOfId?[fresh.renewalOfId]:[])]},status:{in:reservedStatuses},slots:{hasSome:fresh.slots}},select:{quote:true}});
    const conflict=other.some(o=>!getSimulation(o.quote)&&(!orderWebsite(o.quote)||orderWebsite(o.quote)===orderWebsite(fresh.quote)));
    const parent=fresh.renewalOfId?await tx.adsOrder.findUnique({where:{id:fresh.renewalOfId},select:{status:true}}):null;
    const competingRenewal=fresh.renewalOfId?await tx.adsOrder.findFirst({where:{renewalOfId:fresh.renewalOfId,id:{not:id},status:{notIn:["EXPIRED","REJECTED","REFUNDED"]}},select:{id:true}}):null;
    const retainedParent=!fresh.renewalOfId||!!parent&&["ACTIVE","GRACE","REMOVAL_REQUIRED"].includes(parent.status)&&!competingRenewal;
    // Recover delayed notifications only when inventory has not been reassigned
    // and a renewal's original artwork is still retained.
    const next=["PAYMENT","EXPIRED"].includes(fresh.status)&&timely&&!conflict&&retainedParent?"PAYMENT_REVIEW":"REFUND_REQUIRED";
    if(next==="PAYMENT_REVIEW"&&parent?.status==="REMOVAL_REQUIRED"){
      await tx.adsOrder.update({where:{id:fresh.renewalOfId!},data:{status:"GRACE",revision:{increment:1}}});
      await tx.auditLog.create({data:{actorRole:"SYSTEM",action:"ads_order_contract_transition",resourceType:"ads_order",resourceId:fresh.renewalOfId!,metadata:{before:"REMOVAL_REQUIRED",after:"GRACE",note:"Gateway ยืนยันว่าจ่ายต่ออายุทันกำหนดและยังไม่ยืนยันถอดป้าย คงพื้นที่รอตรวจรับ",renewalId:id}}});
    }
    const updated = await tx.adsOrder.update({ where: { id }, data: { status: next, paymentReference, holdUntil: null, revision: { increment: 1 }, quote: { ...(fresh.quote as Prisma.JsonObject), promptpay: { ...snapshot, state: "received", reference, receivedAt: new Date().toISOString(), providerPaidAt, checkoutUrl: null } } } });
    await orderNotice(tx,id,`payment:${snapshot.invoiceNo}`,"อัปเดตผลการชำระเงิน",next==="PAYMENT_REVIEW"?"ตรวจพบยอดชำระแล้ว อยู่ระหว่างเจ้าหน้าที่ตรวจรับคำสั่งซื้อ":"ตรวจพบยอดชำระหลังสิทธิ์จองสิ้นสุด เจ้าหน้าที่กำลังตรวจสอบการคืนเงิน");
    await tx.auditLog.create({ data: { actorRole: "SYSTEM", action: "ads_order_promptpay_received", resourceType: "ads_order", resourceId: id, metadata: { before: fresh.status, after: next, note: next === "PAYMENT_REVIEW" ? "Gateway Sandbox ยืนยันยอด PromptPay แล้ว รอเจ้าหน้าที่ตรวจรับงาน" : "พบยอดชำระ Sandbox หลังสิ้นสุดสิทธิ์จอง ส่งให้เจ้าหน้าที่ตรวจสอบคืนเงิน ยังไม่เริ่มบริการ", reference: paymentReference } } });
    if (next === "REFUND_REQUIRED") await orderAlert(tx, { orderId: id, key: `late-payment:${snapshot.invoiceNo}`, kind: "PAYMENT_ISSUE", title: "พบเงินเข้าหลังหมดเวลาจอง", message: "รายการเข้าคิวตรวจสอบคืนเงิน ยังไม่เริ่มบริการและไม่คืนสิทธิ์จองเดิมอัตโนมัติ" });
    return { received: true, order: publicOrder(updated) };
  });
}

export async function handlePromptPayWebhook(payload: unknown) {
  const config = promptPayConfig();
  const data = verifyGatewayJwt(payload, config.secret);
  if (data.merchantID !== config.merchantID || typeof data.invoiceNo !== "string" || !/^[a-f0-9]{20}$/.test(data.invoiceNo)) throw new ApiError("gateway_payment_mismatch", 400);
  const orders = await prisma.adsOrder.findMany({ where: { quote: { path: ["promptpay", "invoiceNo"], equals: data.invoiceNo } }, select: { id: true }, take: 2 });
  if (orders.length !== 1) throw new ApiError("not_found", 404);
  // Even a signed callback is only a trigger; fetch the authoritative transaction.
  await reconcilePromptPay(orders[0]!.id);
  return { received: true };
}
