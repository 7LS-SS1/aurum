import { describe, it, expect } from "vitest";
import { graceMs, withinRenewal, renewalWindow, renewalHold, unchangedRenewal } from "./ads-renewal";
describe("renewal dates", () => {
  const end = new Date("2026-11-06T10:15:00.000Z");
  const quote = { renewal: { mode: "same", previousEndsAt: end.toISOString(), deadline: new Date(end.getTime() + graceMs).toISOString() } };
  it("accepts advance renewal and excludes exact 72-hour boundary", () => {
    expect(withinRenewal(end, new Date(end.getTime() - 1))).toBe(true);
    expect(withinRenewal(end, new Date(end.getTime() + graceMs - 1))).toBe(true);
    expect(withinRenewal(end, new Date(end.getTime() + graceMs))).toBe(false);
  });
  it("preserves original expiry as cycle start regardless of approval time", () => {
    for (const days of [30, 90, 180]) {
      const future = renewalWindow(quote, days, new Date(end.getTime() - 86400000));
      const late = renewalWindow(quote, days, new Date(end.getTime() + 86400000));
      expect(future.status).toBe("SCHEDULED"); expect(late.status).toBe("ACTIVE");
      expect(future.startsAt).toEqual(end); expect(late.startsAt).toEqual(end);
      expect(late.endsAt.getTime() - end.getTime()).toBe(days * 86400000);
    }
  });
  it("caps payment hold at grace deadline", () => {
    expect(renewalHold(quote, new Date(end.getTime() + 5 * 86400000)).getTime()).toBe(end.getTime() + graceMs);
    expect(renewalHold(quote, end)).toEqual(end);
  });
  it("requires installation review when renewal artwork or positions change", () => {
    expect(unchangedRenewal(quote)).toBe(true);
    expect(unchangedRenewal({renewal:{...quote.renewal,artworkChanged:true}})).toBe(false);
    expect(unchangedRenewal({renewal:{...quote.renewal,mode:"change"}})).toBe(false);
    expect(unchangedRenewal({})).toBe(false);
  });
});
