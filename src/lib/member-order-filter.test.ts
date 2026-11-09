import { describe, expect, it } from "vitest";
import { filterMemberOrders, orderDay, type OrderFilter } from "./member-order-filter";
const filter: OrderFilter = { query: "", from: "", to: "", dateField: "createdAt" };
const orders = [
  { id: "abc-123", quote: { items: ["เว็บไซต์ Alpha", "บนหน้าแรก ช่อง 1"] }, createdAt: "2026-11-05T17:00:00Z", startsAt: null, endsAt: null },
  { id: "def-456", quote: { items: ["เว็บไซต์ Beta", "ใต้วิดีโอ ช่อง 2"] }, createdAt: "2026-11-05T16:59:59Z", startsAt: "2026-11-06T17:00:00Z", endsAt: "2026-12-06T17:00:00Z" },
];
describe("customer order search", () => {
  it("matches full or partial order numbers and combined service terms", () => {
    expect(filterMemberOrders(orders, { ...filter, query: " #ABC-123 " })).toEqual([orders[0]]);
    expect(filterMemberOrders(orders, { ...filter, query: "alpha ช่อง 1" })).toEqual([orders[0]]);
    expect(filterMemberOrders(orders, { ...filter, query: "unknown" })).toEqual([]);
  });
  it("uses inclusive Bangkok calendar dates across UTC midnight boundaries", () => {
    expect(orderDay(orders[0]!.createdAt)).toBe("2026-11-06");
    expect(filterMemberOrders(orders, { ...filter, from: "2026-11-06", to: "2026-11-06" })).toEqual([orders[0]]);
    expect(filterMemberOrders(orders, { ...filter, to: "2026-11-05" })).toEqual([orders[1]]);
  });
  it("filters contract dates and excludes missing dates only when a date is selected", () => {
    expect(filterMemberOrders(orders, { ...filter, dateField: "startsAt" })).toHaveLength(2);
    expect(filterMemberOrders(orders, { ...filter, dateField: "startsAt", from: "2026-11-07", to: "2026-11-07" })).toEqual([orders[1]]);
    expect(filterMemberOrders(orders, { ...filter, dateField: "endsAt", from: "2026-12-07" })).toEqual([orders[1]]);
  });
  it("rejects reversed ranges and does not mutate the loaded records", () => {
    expect(filterMemberOrders(orders, { ...filter, from: "2026-11-07", to: "2026-11-06" })).toEqual([]);
    expect(orders.map(order => order.id)).toEqual(["abc-123", "def-456"]);
    expect(orderDay(null)).toBe("");
    expect(orderDay("invalid")).toBe("");
  });
});
