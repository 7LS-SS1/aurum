import { z } from "zod";
export const bankAccountSchema = z.object({
  id: z.string().uuid(),
  bank: z.string().trim().min(1).max(100),
  number: z.string().regex(/^[0-9 -]{6,30}$/),
  name: z.string().trim().min(1).max(150),
  qr: z.string().uuid().nullable(),
  closedAt: z.string().datetime().nullable(),
  purgeAt: z.string().datetime().nullable(),
  deletedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type BankAccount = z.infer<typeof bankAccountSchema>;
export const transferSchema = z.object({
  accountId: z.string().uuid(),
  state: z.enum(["awaiting", "review", "more_info", "rejected", "confirmed"]),
  attachmentId: z.string().uuid().optional(),
  submittedAt: z.string().datetime().optional(),
  paidAt: z.string().datetime().optional(),
  amountSatang: z.number().int().positive().optional(),
  note: z.string().optional(),
});
export type BankTransfer = z.infer<typeof transferSchema>;
export function getTransfer(quote: unknown): BankTransfer | null {
  const result = transferSchema.safeParse(
    (quote as { bankTransfer?: unknown })?.bankTransfer,
  );
  return result.success ? result.data : null;
}
export function accountAvailable(account: BankAccount) {
  return !account.closedAt && !account.deletedAt;
}
export function purgeDue(account: BankAccount, now = new Date()) {
  return (
    !!account.closedAt &&
    !account.deletedAt &&
    !!account.purgeAt &&
    Date.parse(account.purgeAt) <= now.getTime()
  );
}
export const ledgerSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  direction: z.enum(["IN", "OUT"]),
  amountSatang: z.number().int().positive().max(100000000000),
  reference: z.string().trim().min(3).max(150),
  note: z.string().trim().min(1).max(2000),
  orderId: z.string().uuid().nullable(),
  occurredAt: z.string().datetime(),
  recordedAt: z.string().datetime(),
  actorId: z.string().nullable(),
});
export type BankLedger = z.infer<typeof ledgerSchema>;
