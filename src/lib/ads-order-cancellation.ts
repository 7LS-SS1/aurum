import { getTransfer } from "./bank-transfer";
/** Manual-transfer cancellation only; gateway payments require reconciliation. */
export function canCancelUnpaid(order: { status: string; quote: unknown; paymentReference?: string | null; startsAt?: unknown }) {
  const transfer = getTransfer(order.quote);
  return ["REVIEW", "PAYMENT", "EXPIRED"].includes(order.status) &&
    !!transfer && transfer.state === "awaiting" && !transfer.attachmentId &&
    !transfer.submittedAt && !transfer.paidAt && !order.paymentReference && !order.startsAt;
}
