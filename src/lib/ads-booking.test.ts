import { describe, expect, it } from "vitest";
import { activeWindow, getInventory, inventory, quoteBooking } from "./ads-booking";
import { defaultAdsPage } from "./ads-page-config";
describe("advertising booking", () => {
  it("snapshots public coupon discounts with exact line totals",()=>{
    const config={...defaultAdsPage,coupons:[{code:"WELCOME",percent:10,maxUses:100,enabled:true,startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+60000).toISOString()}]};
    const q=quoteBooking({kind:"homepage",slots:[],days:30,couponCode:"WELCOME"},config);
    expect(q.amount).toBe(9000);expect(q.discount).toBe(1000);expect(q.lines.reduce((n,l)=>n+l.amount,0)).toBe(q.amount);
    expect(()=>quoteBooking({kind:"homepage",slots:[],days:30,couponCode:"INVALID"},config)).toThrow("invalid_coupon");
    expect(()=>quoteBooking({kind:"homepage",slots:[],days:30,couponCode:"WELCOME"},{...config,coupons:config.coupons.map(c=>({...c,enabled:false}))})).toThrow("invalid_coupon");
  });
  it("has eight slots per main position and independently configured extras", () => {
    expect(inventory).toHaveLength(32);
    expect(new Set(inventory.map(s => s.id)).size).toBe(32);
    expect(getInventory(defaultAdsPage)).toHaveLength(37);
    expect(getInventory({ inventoryCounts: { ...defaultAdsPage.inventoryCounts, popup: 3 } })).toHaveLength(39);
  });
  it("combines multiple pages and formats with server-side prices", () => {
    const q = quoteBooking({ kind: "slots", slots: ["home_top:L1", "video_bottom:R4", "popup:1", "video_ad:1"], days: 90 }, defaultAdsPage);
    expect(q.amount).toBe((1500 + 2500 + 6000 + 15000) * 3);
  });
  it("uses approved bundle prices, no accidental per-slot discounts", () => {
    expect(quoteBooking({ kind: "homepage", slots: [], days: 30 }, defaultAdsPage).amount).toBe(10000);
    expect(quoteBooking({ kind: "video", slots: [], days: 30 }, defaultAdsPage).amount).toBe(41000);
    expect(quoteBooking({ kind: "everypage", slots: [], days: 30 }, defaultAdsPage).amount).toBe(27000);
    expect([30, 90, 180].map(days => quoteBooking({ kind: "website", slots: [], days: days as 30 | 90 | 180 }, defaultAdsPage).amount)).toEqual([78000, 210600, 374400]);
  });
  it("rejects unknown and duplicated slots", () => {
    for (const slots of [[], ["home_top:L5"], ["popup:1", "popup:1"]]) expect(() => quoteBooking({ kind: "slots", slots, days: 30 }, defaultAdsPage)).toThrow();
  });
  it("starts exactly at approval and counts days, not calendar months", () => {
    const now = new Date("2026-01-31T12:00:00Z");
    const window = activeWindow(30, now);
    expect(window.startsAt).toBe(now);
    expect(window.endsAt.toISOString()).toBe("2026-03-02T12:00:00.000Z");
  });
});
