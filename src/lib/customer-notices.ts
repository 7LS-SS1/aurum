import type { Prisma } from "@prisma/client";
import { queueMail } from "./service-mail";

export async function customerNotice(tx: Prisma.TransactionClient, input: { viewerId: string | null; key: string; title: string; message: string; href: string }) {
  if (!input.viewerId) return;
  const notice = await tx.customerNotice.upsert({ where: { dedupeKey: input.key }, update: {}, create: { viewerId: input.viewerId, dedupeKey: input.key, title: input.title, message: input.message, href: input.href } });
  const viewer = await tx.viewer.findUnique({ where: { id: input.viewerId }, select: { email: true, emailVerifiedAt: true, suspended: true } });
  if (viewer?.email && viewer.emailVerifiedAt && !viewer.suspended) await queueMail(tx, `notice:${input.key}`, { to: viewer.email, subject: input.title, text: `${input.message}\n\nตรวจสอบรายละเอียดในบัญชี AURUM ของคุณ` });
  return notice;
}
export async function orderNotice(tx: Prisma.TransactionClient, id: string, key: string, title: string, message: string) {
  const order = await tx.adsOrder.findUnique({ where: { id }, select: { viewerId: true } });
  if (order) await customerNotice(tx, { viewerId: order.viewerId, key, title, message, href: `/services/ads-banner/checkout/${id}` });
}
