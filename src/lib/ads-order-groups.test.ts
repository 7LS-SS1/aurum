import { describe, expect, it } from "vitest";
import { orderGroups, isOrderGroup, slotLabel } from "./ads-order-groups";
import { statusLabels } from "./ads-booking";
describe("order status navigation",()=>{
 it("assigns every persisted status to exactly one category",()=>{
  const statuses=[...orderGroups.approved.statuses,...orderGroups.pending.statuses,...orderGroups.cancelled.statuses];
  expect(statuses.sort()).toEqual(Object.keys(statusLabels).sort());
  expect(new Set(statuses).size).toBe(statuses.length);
  expect(orderGroups.pending.statuses).toContain("PAID");
  expect(orderGroups.approved.statuses).toContain("COMPLETED");
 });
 it("rejects inherited keys and preserves slot ordering",()=>{
  expect(isOrderGroup("constructor")).toBe(false);
  expect(slotLabel("home_top:L1")).toBe("บนหน้าแรก · ช่อง 1");
  expect(slotLabel("home_top:R1")).toBe("บนหน้าแรก · ช่อง 2");
  expect(slotLabel("video_bottom:R4")).toBe("ใต้วิดีโอ · ช่อง 8");
  expect(slotLabel("legacy-slot")).toBe("legacy-slot");
 });
});
