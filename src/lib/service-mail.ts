import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { encrypt, decrypt, type EncryptedPayload } from "./crypto";
import { prisma } from "./prisma";

const mailSchema = z.object({ to: z.string().email(), subject: z.string().max(200), text: z.string().max(20000) });
export function mailReady() {
  return process.env.SERVICE_EMAIL_ENABLED === "true" && /^[a-f0-9]{32}$/i.test(process.env.CF_EMAIL_ACCOUNT_ID || "") && !!process.env.CF_EMAIL_API_TOKEN && z.string().email().safeParse(process.env.SERVICE_EMAIL_FROM).success;
}
export async function queueMail(tx: Prisma.TransactionClient, key: string, payload: z.infer<typeof mailSchema>) {
  // Disabled channels do not accumulate credentials or reset links for later delivery.
  if (!mailReady()) return false;
  await tx.serviceMail.upsert({ where: { dedupeKey: key }, update: {}, create: { dedupeKey: key, payload: { ...encrypt(JSON.stringify(mailSchema.parse(payload))) } } });
  return true;
}
export async function deliverServiceMail() {
  if (!mailReady()) return { enabled: false, sent: 0, uncertain: 0 };
  // An interrupted request can have reached the provider. Never blindly resend it.
  await prisma.serviceMail.updateMany({ where: { status: "SENDING", leasedAt: { lt: new Date(Date.now() - 5 * 60000) } }, data: { status: "UNCERTAIN", lastError: "delivery_outcome_unknown" } });
  const rows = await prisma.serviceMail.findMany({ where: { status: "PENDING", availableAt: { lte: new Date() } }, take: 5, orderBy: { createdAt: "asc" } });
  let sent = 0, uncertain = 0;
  for (const row of rows) {
    const claimed = await prisma.serviceMail.updateMany({ where: { id: row.id, status: "PENDING" }, data: { status: "SENDING", leasedAt: new Date(), attempts: { increment: 1 } } });
    if (!claimed.count) continue;
    try {
      const mail = mailSchema.parse(JSON.parse(decrypt(row.payload as unknown as EncryptedPayload)));
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CF_EMAIL_ACCOUNT_ID}/email/sending/send`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${process.env.CF_EMAIL_API_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.SERVICE_EMAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text }) });
      const result = await response.json() as { success?: boolean; result?: { delivered?: string[]; queued?: string[]; permanent_bounces?: string[]; suppressed_recipients?: string[] } };
      if (!response.ok || result.success !== true) throw new Error("provider_not_accepted");
      const status = result.result?.delivered?.includes(mail.to) ? "DELIVERED" : result.result?.queued?.includes(mail.to) ? "ACCEPTED" : result.result?.permanent_bounces?.includes(mail.to) || result.result?.suppressed_recipients?.includes(mail.to) ? "BOUNCED" : "UNCERTAIN";
      await prisma.serviceMail.update({ where: { id: row.id }, data: { status, sentAt: new Date(), lastError: status === "BOUNCED" ? "recipient_rejected" : null, payload: {} } });
      if(status==="DELIVERED"||status==="ACCEPTED")sent++;else if(status==="UNCERTAIN")uncertain++;
    } catch {
      await prisma.serviceMail.update({ where: { id: row.id }, data: { status: "UNCERTAIN", lastError: "provider_outcome_requires_review" } });
      uncertain++;
    }
  }
  return { enabled: true, sent, uncertain };
}
