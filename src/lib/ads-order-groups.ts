import { inventory, extraPlacements } from "./ads-booking";
export const orderGroups = {
  all: { label: "ทั้งหมด", description: "คำสั่งซื้อทุกสถานะ", statuses: [] as string[] },
  approved: { label: "บริการที่อนุมัติแล้ว", description: "อนุมัติเริ่มแสดงแล้ว รวมบริการที่ครบระยะสัญญา", statuses: ["ACTIVE", "SCHEDULED", "GRACE", "REMOVAL_REQUIRED", "COMPLETED"] },
  pending: { label: "รอดำเนินการ", description: "รอตรวจคำขอ รอชำระเงิน รอติดตั้ง หรือรอดำเนินการคืนเงิน", statuses: ["REVIEW", "PAYMENT", "PAYMENT_REVIEW", "PAID", "REFUND_REQUIRED"] },
  cancelled: { label: "ยกเลิก / ไม่อนุมัติ", description: "ไม่อนุมัติ หมดเวลาชำระเงิน หรือคืนเงินเสร็จสิ้น", statuses: ["REJECTED", "EXPIRED", "REFUNDED"] },
};
export type OrderGroup = keyof typeof orderGroups;
export function isOrderGroup(value: string): value is OrderGroup { return Object.hasOwn(orderGroups, value); }
export function slotLabel(id: string) {
  const known = inventory.find(item => item.id === id);
  if (known) return known.label;
  const [placement, index] = id.split(":");
  const extra = extraPlacements.find(item => item.id === placement);
  return extra ? `${extra.label} · ช่อง ${index}` : id;
}
