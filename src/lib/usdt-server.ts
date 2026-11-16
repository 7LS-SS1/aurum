import { randomInt, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./prisma";
import { ApiError } from "./api-response";
import { locked } from "./ads-orders";
import { ensureAdsPaymentInventory } from "./bank-transfer-server";
import { getTransfer } from "./bank-transfer";
import { hasPromptPay } from "./promptpay";
import { hasStripeBilling } from "./stripe-policy";
import { getSimulation } from "./ads-simulation";
import { approveRenewal, ensureRenewalPayable } from "./ads-renewal-server";
import { unchangedRenewal, renewalHold } from "./ads-renewal";
import { orderNotice } from "./customer-notices";
import {
  type Network,
  rpcAddress,
  tronToken,
  wallet,
  invoice,
  unitsFor,
  token,
  transferData,
} from "./usdt";
import type { Actor } from "./authz";

import { marketPrice } from "./usdt-market";

const configId = "usdt-bsc-wallets";
async function wallets(tx: Prisma.TransactionClient) {
  const row = await tx.servicePageConfig.findUnique({
    where: { id: configId },
  });
  return wallet.array().parse(row?.config ?? []);
}
function rpcUrl(network: Network) {
  return network === "tron"
    ? (process.env.USDT_TRON_RPC_URL ?? "https://api.trongrid.io/jsonrpc")
    : (process.env.USDT_BSC_RPC_URL ?? "https://bsc-rpc.publicnode.com");
}
export async function usdtCheckoutReady(network: Network = "bsc") {
  return (
    !!rpcUrl(network) &&
    (await wallets(prisma)).some((w) => w.active && w.network === network)
  );
}
export function listWallets() {
  return wallets(prisma);
}
export function saveWallet(value: z.infer<typeof wallet>, actor: Actor) {
  return locked(async (tx) => {
    const current = await wallets(tx);
    const next = current
      .filter((w) => w.id !== value.id)
      .map((w) =>
        value.active && w.network === value.network
          ? { ...w, active: false }
          : w,
      );
    next.push(value);
    await tx.servicePageConfig.upsert({
      where: { id: configId },
      create: { id: configId, config: next },
      update: { config: next, revision: { increment: 1 } },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        action: "usdt_wallet_updated",
        resourceType: "usdt_wallet",
        resourceId: value.id,
        metadata: { before: current, after: next },
      },
    });
  });
}
async function rpc<T>(
  network: Network,
  method: string,
  params: unknown[],
): Promise<T> {
  const url = rpcUrl(network);
  if (!url) throw new ApiError("usdt_unavailable", 503);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json();
  if (!res.ok || data.error || data.result == null)
    throw new ApiError("usdt_rpc_unavailable", 503);
  return data.result;
}
async function head(tag: string, network: Network = "bsc") {
  if (
    BigInt(await rpc<string>(network, "eth_chainId", [])) !==
    (network === "tron" ? 0x2b6653dcn : 56n)
  )
    throw new ApiError("wrong_network", 503);
  const block = await rpc<{ number: string }>(network, "eth_getBlockByNumber", [
    tag,
    false,
  ]);
  return Number(BigInt(block.number));
}
function snapshot(q: Prisma.JsonValue) {
  return invoice.safeParse((q as Prisma.JsonObject)?.usdt);
}
export async function checkoutState(
  id: string,
  viewerId: string,
  network: Network = "bsc",
) {
  const o = await prisma.adsOrder.findFirst({ where: { id, viewerId } });
  if (!o) throw new ApiError("not_found", 404);
  const existing = snapshot(o.quote);
  const active =
    !existing.success && rpcUrl(network) && o.status === "REVIEW"
      ? (await wallets(prisma)).find((w) => w.active && w.network === network)
      : undefined;
  let blockedReason: string | null = null;
  if (active) {
    try {
      await ensureAdsPaymentInventory(prisma, o);
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 409) throw e;
      blockedReason = e.message;
    }
  }
  const price =
    !blockedReason && active?.automaticRate
      ? await marketPrice().catch(() => null)
      : null;
  const rate = active?.automaticRate ? price?.rate : active?.rate;
  return {
    invoice: existing.success ? existing.data : null,
    available: !!active,
    blockedReason,
    preview: rate
      ? {
          rate,
          units: unitsFor(o.amount, rate, network),
          automatic: !!active?.automaticRate,
          fetchedAt: price?.fetchedAt ?? null,
        }
      : null,
  };
}
// Reserve a six-decimal amount permanently for this destination. A late transfer
// to a shared address must never settle a later customer's invoice.
async function reserveMobileUnits(
  tx: Prisma.TransactionClient,
  network: Network,
  to: string,
  base: string,
) {
  const scale = network === "tron" ? 1n : 1_000_000_000_000n;
  const micros = BigInt(base) / scale;
  const start = randomInt(999);
  const candidates = Array.from(
    { length: 999 },
    (_, i) => micros - BigInt(1 + ((start + i) % 999)),
  )
    .filter((n) => n > 0n && n % 100n !== 0n)
    .map((n) => (n * scale).toString());
  const prefix = "usdt-mobile:" + network + ":" + to + ":";
  const used = new Set(
    (
      await tx.servicePageConfig.findMany({
        where: { id: { in: candidates.map((n) => prefix + n) } },
        select: { id: true },
      })
    ).map((r) => r.id),
  );
  const units = candidates.find((n) => !used.has(prefix + n));
  if (!units) throw new ApiError("usdt_mobile_amount_unavailable", 409);
  await tx.servicePageConfig.create({
    data: { id: prefix + units, config: { reserved: true } },
  });
  return units;
}
export async function openInvoice(
  id: string,
  viewerId: string,
  from: string | null,
  network: Network = "bsc",
) {
  const state = await checkoutState(id, viewerId, network);
  if (state.blockedReason) throw new ApiError(state.blockedReason, 409);
  if (state.available && !state.preview)
    throw new ApiError("usdt_rate_unavailable", 503);
  const cursor = await head("latest", network);
  return locked(async (tx) => {
    const o = await tx.adsOrder.findFirst({ where: { id, viewerId } });
    if (!o) throw new ApiError("not_found", 404);
    const prior = snapshot(o.quote);
    if (
      prior.success &&
      prior.data.network === network &&
      prior.data.from === from &&
      o.status === "PAYMENT" &&
      o.holdUntil &&
      o.holdUntil > new Date()
    )
      return prior.data;
    if (
      o.amount <= 0 ||
      o.status !== "REVIEW" ||
      o.paymentUrl ||
      getTransfer(o.quote) ||
      hasStripeBilling(o.quote) ||
      hasPromptPay(o.quote) ||
      getSimulation(o.quote)
    )
      throw new ApiError("existing_payment_channel", 409);
    const w = (await wallets(tx)).find(
      (w) => w.active && w.network === network,
    );
    if (!w) throw new ApiError("usdt_unavailable", 409);
    const price = state.preview;
    if (
      w.automaticRate &&
      (!price?.automatic ||
        !price.fetchedAt ||
        Date.now() - Date.parse(price.fetchedAt) >= 15000)
    )
      throw new ApiError("usdt_rate_unavailable", 503);
    const rate = w.automaticRate ? price!.rate : w.rate;
    await ensureAdsPaymentInventory(tx, o);
    const holdUntil = renewalHold(o.quote, new Date(Date.now() + 30 * 60000));
    const to = network === "tron" ? w.address : w.address.toLowerCase();
    const base = unitsFor(o.amount, rate, network);
    const bill = invoice.parse({
      from,
      network,
      to,
      ...(from === null ? { mobile: true } : {}),
      rate,
      rateSource: w.automaticRate ? "bitkub" : "manual",
      ...(w.automaticRate ? { rateFetchedAt: price!.fetchedAt } : {}),
      units:
        from === null ? await reserveMobileUnits(tx, network, to, base) : base,
      tag: randomUUID().replaceAll("-", ""),
      cursor,
      archived: false,
      expires: holdUntil.toISOString(),
    });
    await tx.adsOrder.update({
      where: { id },
      data: {
        status: "PAYMENT",
        holdUntil,
        revision: { increment: 1 },
        quote: { ...(o.quote as Prisma.JsonObject), usdt: bill },
      },
    });
    return bill;
  });
}
const topic =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const indexed = (a: string) =>
  "0x" + a.slice(2).toLowerCase().padStart(64, "0");
const hex = (n: number) => "0x" + n.toString(16);
async function reconcile(id: string, quote: Prisma.JsonValue, final: number) {
  const i = invoice.parse((quote as Prisma.JsonObject).usdt);
  const network = i.network;
  const contract = network === "tron" ? rpcAddress(tronToken, network) : token;
  const sender = i.from ? rpcAddress(i.from, network) : null,
    receiver = rpcAddress(i.to, network);
  const end = Math.min(i.cursor + 1000, final);
  if (end <= i.cursor) return;
  const topics = [topic, sender ? indexed(sender) : null, indexed(receiver)];
  const logs = await rpc<
    {
      address: string;
      topics: string[];
      transactionHash: string;
      logIndex?: string;
      data: string;
      blockNumber: string;
      removed: boolean;
    }[]
  >(network, "eth_getLogs", [
    {
      address: contract,
      topics,
      fromBlock: hex(i.cursor + 1),
      toBlock: hex(end),
    },
  ]);
  let match: { hash: string; time: number; event?: string } | undefined;
  for (const log of logs) {
    if (
      log.removed ||
      log.address.toLowerCase() !== contract ||
      !topics.every(
        (t, k) => t === null || log.topics[k]?.toLowerCase() === t,
      ) ||
      BigInt(log.data) !== BigInt(i.units)
    )
      continue;
    if (!i.mobile) {
      const txn = await rpc<{ input: string; to: string; from: string }>(
        network,
        "eth_getTransactionByHash",
        [log.transactionHash],
      );
      if (
        txn.input.toLowerCase() !== transferData(i) ||
        txn.to.toLowerCase() !== contract ||
        txn.from.toLowerCase() !== sender
      )
        continue;
    }
    const block = await rpc<{ timestamp: string }>(
      network,
      "eth_getBlockByNumber",
      [log.blockNumber, false],
    );
    if (i.mobile && !/^0x[0-9a-f]+$/i.test(log.logIndex ?? ""))
      throw new ApiError("usdt_rpc_unavailable", 503);
    match = {
      ...(i.mobile ? { event: BigInt(log.logIndex!).toString() } : {}),
      hash: log.transactionHash,
      time: Number(BigInt(block.timestamp)) * 1000,
    };
    break;
  }
  const endBlock = await rpc<{ timestamp: string }>(
    network,
    "eth_getBlockByNumber",
    [hex(end), false],
  );
  return locked(async (tx) => {
    const o = await tx.adsOrder.findUniqueOrThrow({ where: { id } });
    const now = invoice.parse((o.quote as Prisma.JsonObject).usdt);
    if (now.settled || now.cursor !== i.cursor) return;
    const updated = {
      ...now,
      cursor: end,
      archived:
        Number(BigInt(endBlock.timestamp)) * 1000 >
        Date.parse(i.expires) + 86400000,
    };
    let status = o.status;
    let activation: Prisma.AdsOrderUpdateInput = {};
    if (
      !match &&
      status === "PAYMENT" &&
      Number(BigInt(endBlock.timestamp)) * 1000 > Date.parse(i.expires)
    )
      status = "EXPIRED";
    if (match) {
      status =
        o.status === "PAYMENT" && match.time <= Date.parse(i.expires)
          ? "PAID"
          : "REFUND_REQUIRED";
      if (status === "PAID" && o.renewalOfId) {
        try {
          await ensureRenewalPayable(tx, o);
        } catch (e) {
          if (!(e instanceof ApiError)) throw e;
          status = "REFUND_REQUIRED";
        }
      }
      if (
        status === "PAID" &&
        (unchangedRenewal(o.quote) ||
          (o.fulfillmentStage === "approved" && o.installationProof))
      ) {
        const paidQuote = {
          ...(o.quote as Prisma.JsonObject),
          paymentConfirmedAt: new Date(match.time).toISOString(),
        };
        const window = await approveRenewal(tx, { ...o, quote: paidQuote });
        activation = { ...window, fulfillmentStage: "approved" };
        status = window.status;
      }
      await tx.auditLog.create({
        data: {
          actorRole: "SYSTEM",
          resourceType: "ads_order",
          resourceId: id,
          action: "usdt_confirmed",
          metadata: {
            hash: match.hash,
            before: o.status,
            after: status,
            units: i.units,
          },
        },
      });
      Object.assign(updated, {
        hash: match.hash,
        settled: true,
        archived: true,
      });
      await orderNotice(
        tx,
        id,
        "usdt:" +
          match.hash +
          (match.event !== undefined ? ":" + match.event : ""),
        "ได้รับยอดชำระ USDT แล้ว",
        status === "REFUND_REQUIRED"
          ? "เจ้าหน้าที่จะตรวจสอบยอดหลังปิดรายการ"
          : status === "PAID"
            ? "เข้าสู่ขั้นตอนติดตั้งโฆษณา"
            : "ยืนยันสิทธิ์ใช้งานตามรอบสัญญาแล้ว",
      );
    }
    await tx.adsOrder.update({
      where: { id },
      data: {
        ...activation,
        status,
        ...(match
          ? {
              paymentReference:
                network +
                ":" +
                match.hash +
                (match.event !== undefined ? ":" + match.event : ""),
              revision: { increment: 1 },
            }
          : {}),
        quote: {
          ...(o.quote as Prisma.JsonObject),
          usdt: updated,
          ...(match
            ? { paymentConfirmedAt: new Date(match.time).toISOString() }
            : {}),
        },
      },
    });
    return updated.archived || end >= final ? undefined : updated;
  });
}
export async function checkOwnedInvoice(id: string, viewerId: string) {
  const row = await prisma.adsOrder.findFirst({
    where: { id, viewerId },
    select: { quote: true },
  });
  if (!row) throw new ApiError("not_found", 404);
  const bill = snapshot(row.quote);
  if (bill.success && !bill.data.archived && !bill.data.settled)
    await reconcile(id, row.quote, await head("finalized", bill.data.network));
}
export async function recoverUsdt(after?: string) {
  const pending = { quote: { path: ["usdt", "archived"], equals: false } };
  const page = (cursor?: string) =>
    prisma.adsOrder.findMany({
      where: { ...pending, ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: "asc" },
      take: 25,
      select: { id: true, quote: true },
    });
  let rows = await page(after);
  if (after && !rows.length) rows = await page();
  const heads = new Map<Network, Promise<number>>();
  const deadline = Date.now() + 90_000;
  let failed = 0,
    checked = 0,
    cursor = "";
  for (const row of rows) {
    if (cursor && Date.now() >= deadline) break;
    cursor = row.id;
    try {
      const network = invoice.parse(
        (row.quote as Prisma.JsonObject).usdt,
      ).network;
      let request = heads.get(network);
      if (!request) {
        request = head("finalized", network);
        heads.set(network, request);
      }
      const final = await request;
      let quote = row.quote;
      for (let batch = 0; batch < 5; batch++) {
        const next = await reconcile(row.id, quote, final);
        if (!next || Date.now() >= deadline) break;
        quote = { usdt: next };
      }
      checked++;
    } catch {
      failed++;
    }
  }
  return { failed, checked, cursor };
}
