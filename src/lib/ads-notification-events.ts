import type { Prisma } from "@prisma/client";

export async function orderAlert(tx: Prisma.TransactionClient, input: { orderId: string; key: string; kind: string; title: string; message: string }) {
  return tx.adsNotification.upsert({ where: { dedupeKey: input.key }, update: {}, create: { orderId: input.orderId, dedupeKey: input.key, kind: input.kind, title: input.title, message: input.message } });
}
