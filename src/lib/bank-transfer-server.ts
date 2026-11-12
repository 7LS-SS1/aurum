import { randomUUID, createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./prisma";
import { locked, orderWebsite, publicOrder } from "./ads-orders";
import { ApiError } from "./api-response";
import {
  bankAccountSchema,
  accountAvailable,
  purgeDue,
  getTransfer,
  ledgerSchema,
  type BankAccount,
} from "./bank-transfer";
import {
  deleteBankQr,
  readAttachment,
  attachmentBytes,
} from "./ads-attachments";
import { getSimulation } from "./ads-simulation";
import { hasPromptPay } from "./promptpay";
import { hasStripeBilling } from "./stripe-policy";
import { ensureRenewalPayable, reservedStatuses } from "./ads-renewal-server";
import { renewalHold } from "./ads-renewal";
import { adsSlotsOverlap, getInventory } from "./ads-booking";
import { adsPageSchema, defaultAdsPage } from "./ads-page-config";
import { manualOccupiedSlots } from "./ads-manual";
import { orderNotice } from "./customer-notices";
import { orderAlert } from "./ads-notification-events";
import type { Actor } from "./authz";
const accountKey = (id: string) => `bank-account:${id}`;
async function put(tx: Prisma.TransactionClient, id: string, value: unknown) {
  const config = JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  await tx.servicePageConfig.upsert({
    where: { id },
    create: { id, config },
    update: { config, revision: { increment: 1 } },
  });
}
async function account(tx: Prisma.TransactionClient, id: string) {
  const row = await tx.servicePageConfig.findUnique({
    where: { id: accountKey(id) },
  });
  if (!row) throw new ApiError("account_not_found", 404);
  return bankAccountSchema.parse(row.config);
}
async function audit(
  tx: Prisma.TransactionClient,
  actor: Actor,
  id: string,
  action: string,
  note: string,
) {
  await tx.auditLog.create({
    data: {
      actorId: actor.id,
      actorRole: actor.role,
      resourceType: "bank_account",
      resourceId: id,
      action,
      metadata: { note },
    },
  });
}
export async function purgeBankAccounts() {
  return locked(async (tx) => {
    let purged = 0;
    const rows = await tx.servicePageConfig.findMany({
      where: { id: { startsWith: "bank-account:" } },
    });
    for (const row of rows
      .filter((r) => purgeDue(bankAccountSchema.parse(r.config)))
      .slice(0, 1)) {
      const a = bankAccountSchema.parse(row.config);
      if (purgeDue(a)) {
        if (a.qr) await deleteBankQr(a.qr);
        await put(tx, row.id, {
          ...a,
          bank: "ลบบัญชีแล้ว",
          number: "000000",
          name: "ลบบัญชีแล้ว",
          qr: null,
          deletedAt: new Date().toISOString(),
        });
        await audit(
          tx,
          { id: null, role: "SYSTEM" },
          a.id,
          "bank_account_purged",
          "ลบข้อมูลบัญชีที่ปิดครบ 30 วัน คงประวัติธุรกรรม",
        );
        purged++;
      }
    }
    return purged;
  });
}
export async function readBankAccounts() {
  await purgeBankAccounts();
  const rows = await prisma.servicePageConfig.findMany({
    where: { id: { startsWith: "bank-account:" } },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((r) => bankAccountSchema.parse(r.config));
}
export const newAccountSchema = bankAccountSchema.pick({
  bank: true,
  number: true,
  name: true,
  qr: true,
});
export async function addBankAccount(
  input: z.infer<typeof newAccountSchema>,
  actor: Actor,
) {
  if (input.qr) {
    const f = await readAttachment(input.qr);
    if (f.owner !== `bank:${actor.id}` || !f.type.startsWith("image/"))
      throw new ApiError("invalid_qr", 422);
  }
  return locked(async (tx) => {
    if (
      input.qr &&
      (await tx.servicePageConfig.findFirst({
        where: {
          id: { startsWith: "bank-account:" },
          config: { path: ["qr"], equals: input.qr },
        },
      }))
    )
      throw new ApiError("qr_already_used", 409);
    const a: BankAccount = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      closedAt: null,
      purgeAt: null,
      deletedAt: null,
    };
    await put(tx, accountKey(a.id), a);
    await audit(tx, actor, a.id, "bank_account_created", "เพิ่มบัญชีรับชำระ");
    return a;
  });
}
export async function closeBankAccount(id: string, actor: Actor) {
  return locked(async (tx) => {
    const a = await account(tx, id);
    if (a.closedAt) return a;
    const now = Date.now();
    const closed = {
      ...a,
      closedAt: new Date(now).toISOString(),
      purgeAt: new Date(now + 30 * 86400000).toISOString(),
    };
    await put(tx, accountKey(id), closed);
    await audit(
      tx,
      actor,
      id,
      "bank_account_closed",
      "ปิดรับชำระทันที กำหนดลบข้อมูลใน 30 วัน",
    );
    return closed;
  });
}
export async function bankDetail(id: string) {
  await purgeBankAccounts();
  return locked(async (tx) => {
    const a = await account(tx, id);
    const rows = await tx.servicePageConfig.findMany({
      where: { id: { startsWith: `bank-ledger:${id}:` } },
      orderBy: { updatedAt: "desc" },
    });
    const entries = rows.map((r) => ledgerSchema.parse(r.config));
    const pending = await tx.adsOrder.findMany({
      where: { quote: { path: ["bankTransfer", "accountId"], equals: id } },
      select: {
        id: true,
        revision: true,
        amount: true,
        status: true,
        quote: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
    return {
      account: a,
      entries,
      pending: pending.map((o) => ({
        id: o.id,
        revision: o.revision,
        amount: o.amount,
        status: o.status,
        transfer: getTransfer(o.quote),
      })),
    };
  });
}
export const entryInput = ledgerSchema.pick({
  accountId: true,
  direction: true,
  amountSatang: true,
  reference: true,
  note: true,
  occurredAt: true,
});
async function ledger(
  tx: Prisma.TransactionClient,
  input: z.infer<typeof entryInput>,
  actor: Actor,
  orderId: string | null,
) {
  const fingerprint = createHash("sha256")
    .update(`${input.accountId}:${input.reference.toLowerCase()}`)
    .digest("hex");
  const key = `bank-reference:${fingerprint}`;
  if (await tx.servicePageConfig.findUnique({ where: { id: key } }))
    throw new ApiError("duplicate_reference", 409);
  const row = ledgerSchema.parse({
    ...input,
    id: randomUUID(),
    recordedAt: new Date().toISOString(),
    actorId: actor.id,
    orderId,
  });
  await tx.servicePageConfig.create({
    data: { id: key, config: { entryId: row.id } },
  });
  await put(tx, `bank-ledger:${input.accountId}:${row.id}`, row);
  return row;
}
export async function recordBankEntry(
  input: z.infer<typeof entryInput>,
  actor: Actor,
) {
  return locked(async (tx) => {
    const a = await account(tx, input.accountId);
    if (a.deletedAt) throw new ApiError("account_deleted", 409);
    if (Date.parse(input.occurredAt) > Date.now())
      throw new ApiError("invalid_payment_date", 422);
    const row = await ledger(tx, input, actor, null);
    await audit(
      tx,
      actor,
      a.id,
      "bank_entry_recorded",
      `บันทึกรายการ ${row.id}`,
    );
    return row;
  });
}
export async function readTransferOrder(id: string, viewerId: string) {
  return locked(async (tx) => {
    const accountRows = await tx.servicePageConfig.findMany({
      where: { id: { startsWith: "bank-account:" } },
    });
    const accounts = accountRows
      .map((r) => bankAccountSchema.parse(r.config))
      .filter(accountAvailable);
    const o = await tx.adsOrder.findFirst({ where: { id, viewerId } });
    if (!o || getSimulation(o.quote)) throw new ApiError("not_found", 404);
    return { order: publicOrder(o), transfer: getTransfer(o.quote), accounts };
  });
}
export async function selectTransferAccount(
  id: string,
  accountId: string,
  viewerId: string,
) {
  return locked(async (tx) => {
    const o = await tx.adsOrder.findFirst({ where: { id, viewerId } });
    if (!o) throw new ApiError("not_found", 404);
    if (
      getSimulation(o.quote) ||
      hasPromptPay(o.quote) ||
      hasStripeBilling(o.quote) ||
      o.paymentUrl
    )
      throw new ApiError("existing_payment_channel", 409);
    const a = await account(tx, accountId);
    if (!accountAvailable(a)) throw new ApiError("account_closed", 409);
    const transfer = getTransfer(o.quote);
    if (
      transfer &&
      transfer.accountId === accountId &&
      o.status === "PAYMENT" &&
      transfer.state === "awaiting"
    )
      return;
    if (o.status !== "REVIEW") throw new ApiError("invalid_transition", 409);
    await ensureRenewalPayable(tx, o);
    const settings = await tx.servicePageConfig.findUnique({
      where: { id: "ads-banner" },
    });
    const page = settings
      ? adsPageSchema.parse(settings.config)
      : defaultAdsPage;
    const websiteId = orderWebsite(o.quote);
    if (
      !websiteId ||
      !page.websites.some((w) => w.id === websiteId && w.enabled)
    )
      throw new ApiError("website_unavailable", 409);
    const inventory = getInventory(page);
    if (
      !o.slots.length ||
      o.slots.some((slot) => !inventory.some((s) => s.id === slot))
    )
      throw new ApiError("inventory_changed", 409);
    const others = await tx.adsOrder.findMany({
      where: {
        id: { notIn: [id, ...(o.renewalOfId ? [o.renewalOfId] : [])] },
        status: { in: reservedStatuses },
      },
      select: { slots: true, quote: true },
    });
    if (
      adsSlotsOverlap(await manualOccupiedSlots(tx, websiteId), o.slots) ||
      others.some(
        (r) =>
          !getSimulation(r.quote) &&
          (!orderWebsite(r.quote) || orderWebsite(r.quote) === websiteId) &&
          adsSlotsOverlap(r.slots, o.slots),
      )
    )
      throw new ApiError("slots_unavailable", 409);
    await tx.adsOrder.update({
      where: { id },
      data: {
        status: "PAYMENT",
        holdUntil: renewalHold(o.quote, new Date(Date.now() + 24 * 3600000)),
        revision: { increment: 1 },
        quote: {
          ...(o.quote as Prisma.JsonObject),
          bankTransfer: { accountId, state: "awaiting" },
        },
      },
    });
  });
}
export const slipInput = z
  .object({
    id: z.string().uuid(),
    attachmentId: z.string().uuid(),
    amountSatang: z.number().int().positive(),
    paidAt: z.string().datetime(),
  })
  .strict();
export async function submitTransferSlip(
  input: z.infer<typeof slipInput>,
  viewerId: string,
) {
  const f = await readAttachment(input.attachmentId);
  if (
    f.owner !== viewerId ||
    !["image/png", "image/jpeg", "image/webp"].includes(f.type)
  )
    throw new ApiError("invalid_slip", 422);
  if (Date.parse(input.paidAt) > Date.now() + 60000)
    throw new ApiError("invalid_payment_date", 422);
  const digest = createHash("sha256")
    .update(await attachmentBytes(f.id))
    .digest("hex");
  return locked(async (tx) => {
    const o = await tx.adsOrder.findFirst({
      where: { id: input.id, viewerId },
    });
    const t = o && getTransfer(o.quote);
    if (!o || !t) throw new ApiError("not_found", 404);
    if (
      !["PAYMENT", "PAYMENT_REVIEW", "EXPIRED"].includes(o.status) ||
      t.state === "confirmed" ||
      t.state === "review"
    )
      throw new ApiError("invalid_transition", 409);
    if (input.amountSatang !== o.amount * 100)
      throw new ApiError("amount_mismatch", 422);
    const key = `bank-slip:${digest}`;
    const previous = await tx.servicePageConfig.findUnique({
      where: { id: key },
    });
    if (previous && (previous.config as Prisma.JsonObject).orderId !== o.id)
      throw new ApiError("duplicate_slip", 409);
    await put(tx, key, { orderId: o.id });
    const t2 = {
      ...t,
      state: "review",
      attachmentId: f.id,
      amountSatang: input.amountSatang,
      paidAt: input.paidAt,
      submittedAt: new Date().toISOString(),
    };
    await tx.adsOrder.update({
      where: { id: o.id },
      data: {
        status: o.status === "EXPIRED" ? "EXPIRED" : "PAYMENT_REVIEW",
        revision: { increment: 1 },
        quote: { ...(o.quote as Prisma.JsonObject), bankTransfer: t2 },
      },
    });
    await orderAlert(tx, {
      orderId: o.id,
      key: `bank-slip:${o.id}:${o.revision}`,
      kind: "PAYMENT_ISSUE",
      title: "มีสลิปรอตรวจสอบ",
      message: "ตรวจเงินเข้าจริงก่อนยืนยันการชำระเงิน",
    });
  });
}
export const reviewInput = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().positive(),
    decision: z.enum(["confirm", "more_info", "reject"]),
    note: z.string().trim().min(1).max(2000),
    reference: z.string().trim().min(3).max(150).optional(),
    paidAt: z.string().datetime().optional(),
    amountSatang: z.number().int().positive().optional(),
  })
  .strict();
export async function reviewTransfer(
  input: z.infer<typeof reviewInput>,
  actor: Actor,
) {
  return locked(async (tx) => {
    const o = await tx.adsOrder.findUnique({ where: { id: input.id } });
    const t = o && getTransfer(o.quote);
    if (
      !o ||
      !t ||
      t.state !== "review" ||
      !["PAYMENT_REVIEW", "EXPIRED"].includes(o.status)
    )
      throw new ApiError("invalid_transition", 409);
    if (o.revision !== input.revision)
      throw new ApiError("revision_conflict", 409);
    let status = o.status;
    let state = "more_info";
    if (input.decision === "confirm") {
      if (
        !input.reference ||
        !input.paidAt ||
        input.amountSatang !== o.amount * 100 ||
        Date.parse(input.paidAt) > Date.now() ||
        Date.parse(input.paidAt) < o.createdAt.getTime()
      )
        throw new ApiError("payment_mismatch", 422);
      await ledger(
        tx,
        {
          accountId: t.accountId,
          direction: "IN",
          amountSatang: input.amountSatang,
          reference: input.reference,
          note: input.note,
          occurredAt: input.paidAt,
        },
        actor,
        o.id,
      );
      status =
        o.status === "PAYMENT_REVIEW" &&
        (!o.holdUntil || Date.parse(input.paidAt) <= o.holdUntil.getTime())
          ? "PAID"
          : "REFUND_REQUIRED";
      if (o.renewalOfId) {
        try {
          await ensureRenewalPayable(tx, o);
        } catch {
          status = "REFUND_REQUIRED";
        }
      }
      state = "confirmed";
    } else if (input.decision === "reject") {
      state = "rejected";
      status = "EXPIRED";
    }
    await tx.adsOrder.update({
      where: { id: o.id },
      data: {
        status,
        staffNote: input.note,
        revision: { increment: 1 },
        ...(input.decision === "confirm"
          ? { paymentReference: `bank:${t.accountId}:${input.reference}` }
          : {}),
        quote: {
          ...(o.quote as Prisma.JsonObject),
          bankTransfer: { ...t, state, note: input.note },
          ...(input.decision === "confirm"
            ? { paymentConfirmedAt: input.paidAt }
            : {}),
        },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        resourceType: "ads_order",
        resourceId: o.id,
        action: `bank_transfer_${input.decision}`,
        metadata: { before: o.status, after: status, note: input.note },
      },
    });
    await orderNotice(
      tx,
      o.id,
      `bank-review:${o.revision}`,
      "ผลตรวจสอบการชำระเงิน",
      input.note,
    );
  });
}

export async function recordTransferRefund(
  tx: Prisma.TransactionClient,
  order: { id: string; quote: Prisma.JsonValue; amount: number },
  reference: string,
  actor: Actor,
) {
  const t = getTransfer(order.quote);
  if (!t || t.state !== "confirmed")
    throw new ApiError("payment_required", 409);
  await ledger(
    tx,
    {
      accountId: t.accountId,
      direction: "OUT",
      amountSatang: order.amount * 100,
      reference,
      note: "คืนเงินคำสั่งซื้อ " + order.id,
      occurredAt: new Date().toISOString(),
    },
    actor,
    order.id,
  );
}
