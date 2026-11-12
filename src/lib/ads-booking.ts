import { z } from "zod";
import type { AdsPageConfig } from "./ads-page-config";

export const placements = [
  { id: "home_top", label: "บนหน้าแรก", group: 0, row: 0 },
  { id: "home_bottom", label: "ท้ายหน้าแรก", group: 0, row: 1 },
  { id: "video_top", label: "เหนือวิดีโอ", group: 1, row: 0 },
  { id: "video_bottom", label: "ใต้วิดีโอ", group: 1, row: 1 },
] as const;
export const inventory = placements.flatMap(p => [1, 2, 3, 4].flatMap(n => ["L", "R"].map((side, index) => ({ id: `${p.id}:${side}${n}`, label: `${p.label} · ช่อง ${(n - 1) * 2 + index + 1}`, group: p.group, row: p.row }))));
export const extraPlacements = [
  { id: "popup", label: "Popup · ทุกหน้า", group: 2, row: 0 },
  { id: "fixed_left", label: "Fixed ซ้าย · ทุกหน้า", group: 2, row: 1 },
  { id: "fixed_right", label: "Fixed ขวา · ทุกหน้า", group: 2, row: 1 },
  { id: "fixed_bottom", label: "Fixed ล่าง · ทุกหน้า", group: 2, row: 2 },
  { id: "video_ad", label: "Video Ads Pre-Player", group: 1, row: 2 },
] as const;
export function getInventory(_config: Pick<AdsPageConfig, "inventoryCounts">) {
  void _config; // Retain the caller contract; physical capacities are now fixed.
  return [...inventory, ...extraPlacements.flatMap(p => Array.from({ length: p.id === "video_ad" ? 3 : 1 }, (_, i) => ({ id: `${p.id}:${i + 1}`, label: `${p.label} · ${p.id === "video_ad" ? "ลำดับ" : "ช่อง"} ${i + 1}`, group: p.group, row: p.row })))];
}
export const statusLabels: Record<string, string> = {
  SCHEDULED: "อนุมัติต่ออายุแล้ว รอเริ่มรอบใหม่", GRACE: "ช่วงต่ออายุ 3 วัน · ยังคงแสดงป้าย",
  PAYMENT_REVIEW: "รอเจ้าหน้าที่ตรวจสอบการชำระเงิน",
  REVIEW: "รอเปิดช่องทางชำระเงิน", PAYMENT: "รอชำระเงิน", PAID: "ชำระแล้ว รอเจ้าหน้าที่ตรวจและติดตั้ง",
  ACTIVE: "กำลังแสดงโฆษณา", COMPLETED: "ครบระยะเวลา", REJECTED: "ไม่อนุมัติ",
  EXPIRED: "หมดเวลาชำระเงิน", REFUND_REQUIRED: "รอคืนเงิน", REFUNDED: "คืนเงินแล้ว",
  REMOVAL_REQUIRED: "ครบระยะเวลา รอเจ้าหน้าที่นำป้ายออก",
};
export const bookingSchema = z.object({
  renewalOfId: z.string().uuid().optional(),
  renewalMode: z.enum(["same", "change"]).optional(),
  websiteId: z.string().uuid().optional(),
  requestId: z.string().uuid(),
  couponCode: z.string().trim().regex(/^[A-Z0-9_-]{3,30}$/).optional(),
  expectedAmount: z.number().int().nonnegative().max(2147483647),
  kind: z.enum(["slots", "homepage", "video", "everypage", "website"]),
  slots: z.array(z.string().max(60)).max(72),
  days: z.union([z.literal(30), z.literal(90), z.literal(180)]),
  name: z.string().trim().min(2).max(120),
  email: z.union([z.literal(""), z.string().trim().email().max(200)]),
  contact: z.string().trim().min(3).max(200),
  artworkUrl: z.union([z.literal(""), z.string().url().max(2000).refine(v => new URL(v).protocol === "https:")]).default(""),
  attachments: z.array(z.object({ slot: z.string().max(60), fileId: z.string().uuid(), targetUrl: z.string().url().max(2000).refine(v => new URL(v).protocol === "https:", "ใช้ลิงก์ HTTPS") }).strict()).max(72).optional(),
  targetUrl: z.string().url().max(2000).refine(v => new URL(v).protocol === "https:", "ใช้ลิงก์ HTTPS"),
  note: z.string().trim().max(2000),
  acceptedTerms: z.literal(true),
}).strict();
export type BookingInput = z.infer<typeof bookingSchema>;
export function quoteBooking(input: Pick<BookingInput, "kind" | "slots" | "days" | "couponCode">, config: Pick<AdsPageConfig, "groups" | "packages" | "inventoryCounts"> & Partial<Pick<AdsPageConfig,"coupons">>) {
  const all = getInventory(config);
  const groupIndex = { homepage: 0, video: 1, everypage: 2 } as const;
  const ids = input.kind === "slots" ? input.slots : all.filter(s => input.kind === "website" || s.group === groupIndex[input.kind as keyof typeof groupIndex]).map(s => s.id);
  if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !all.some(s => s.id === id))) throw new Error("invalid_slots");
  const selected = ids.map(id => all.find(s => s.id === id)!);
  const monthly = input.kind === "slots" || input.kind === "website" ? selected.reduce((sum, s) => sum + config.groups[s.group]!.rows[s.row]![2], 0) : config.groups[groupIndex[input.kind]]!.total;
  const wholePlan = config.packages.find(p => p.months * 30 === input.days);
  if (input.kind === "website" && !wholePlan) throw new Error("invalid_package");
  // The approved 10/20% discounts apply only to the whole-website package.
  const subtotal = input.kind === "website" ? wholePlan!.price : monthly * (input.days / 30);
  const coupon=input.couponCode?config.coupons?.find(c=>c.enabled&&c.code===input.couponCode&&Date.parse(c.startsAt)<=Date.now()&&Date.parse(c.endsAt)>Date.now()):undefined;
  if(input.couponCode&&!coupon)throw new Error("invalid_coupon");
  const discount=coupon?Math.floor(subtotal*coupon.percent/100):0;
  const amount=subtotal-discount;
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 2147483647) throw new Error("invalid_amount");
  const lines = input.kind === "slots" ? selected.map(s => ({ label: s.label, quantity: input.days / 30, unitPrice: config.groups[s.group]!.rows[s.row]![2], amount: config.groups[s.group]!.rows[s.row]![2] * (input.days / 30) })) : [{ label: "แพ็กเกจ " + input.kind + " · " + input.days + " วัน", quantity: 1, unitPrice: subtotal, amount:subtotal }];
  if(coupon)lines.push({label:`ส่วนลด ${coupon.code} (${coupon.percent}%)`,quantity:1,unitPrice:-discount,amount:-discount});
  return { lines, subtotal, discount, ...(coupon?{coupon:{code:coupon.code,percent:coupon.percent,startsAt:coupon.startsAt,endsAt:coupon.endsAt}}:{}), slots: ids, items: selected.map(s => s.label), amount, currency: "THB", days: input.days, kind: input.kind };
}
export function activeWindow(days: number, now = new Date()) {
  return { startsAt: now, endsAt: new Date(now.getTime() + days * 86400000) };
}

/** Old extra slots block their physical placement until explicitly removed. */
export function occupiedPhysicalSlots(slots: string[]) {
  return [...new Set(slots.flatMap(slot => {
    if (/^(popup|fixed_left|fixed_right|fixed_bottom):\d+$/.test(slot)) return [slot, slot.split(":")[0] + ":1"];
    if (/^video_ad:\d+$/.test(slot) && Number(slot.split(":")[1]) > 3) return [slot, "video_ad:1", "video_ad:2", "video_ad:3"];
    return [slot];
  }))];
}
export function adsSlotsOverlap(left: string[], right: string[]) {
  const occupied = new Set(occupiedPhysicalSlots(left));
  return occupiedPhysicalSlots(right).some(slot => occupied.has(slot));
}
