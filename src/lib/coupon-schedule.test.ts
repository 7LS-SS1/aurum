import { afterEach, describe, expect, it, vi } from "vitest";
import { bangkokInput, bangkokIso, couponState } from "./coupon-schedule";
import { quoteBooking } from "./ads-booking";
import { defaultAdsPage, adsPageSchema } from "./ads-page-config";
const coupon = {code:"NOVEMBER",percent:10,startsAt:"2026-11-09T17:00:00.000Z",endsAt:"2026-11-10T17:00:00.000Z",maxUses:100,enabled:true};
afterEach(()=>vi.useRealTimers());
describe("scheduled discounts",()=>{
 it("uses Thai time regardless of the browser timezone",()=>{
  expect(bangkokInput(coupon.startsAt)).toBe("2026-11-10T00:00");
  expect(bangkokIso("2026-11-10T00:00")).toBe(coupon.startsAt);
  expect(bangkokIso("")).toBe("");
 });
 it("includes start and excludes expiry",()=>{
  expect(couponState(coupon,Date.parse(coupon.startsAt)-1)).toBe("รอเริ่ม");
  expect(couponState(coupon,Date.parse(coupon.startsAt))).toBe("ใช้งานได้");
  expect(couponState(coupon,Date.parse(coupon.endsAt))).toBe("หมดอายุ");
  expect(couponState({...coupon,enabled:false},Date.parse(coupon.startsAt))).toBe("ปิดใช้งาน");
 });
 it("enforces the same boundary on the server and snapshots terms",()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date(coupon.startsAt));
  const config={...defaultAdsPage,coupons:[coupon]};
  const input={kind:"homepage" as const,slots:[],days:30 as const,couponCode:coupon.code};
  const quote=quoteBooking(input,config);
  expect(quote.amount).toBe(9000);expect(quote.discount).toBe(1000);
  expect(quote.coupon).toMatchObject({startsAt:coupon.startsAt,endsAt:coupon.endsAt});
  vi.setSystemTime(new Date(coupon.endsAt));expect(()=>quoteBooking(input,config)).toThrow("invalid_coupon");
  expect(quote.amount).toBe(9000);
 });
 it("rejects reversed dates and duplicate codes",()=>{
  expect(adsPageSchema.safeParse({...defaultAdsPage,coupons:[{...coupon,endsAt:coupon.startsAt}]}).success).toBe(false);
  expect(adsPageSchema.safeParse({...defaultAdsPage,coupons:[coupon,coupon]}).success).toBe(false);
 });
});
