import { describe, it, expect } from "vitest";
import { actionOptions, orderWorkflow, type AdminAdsOrder, type OrderEvent } from "./ads-order-workflow";
import { newSimulation } from "./ads-simulation";

const order: AdminAdsOrder = { id: "test", slots: [], createdAt: "2026-11-06T00:00:00Z", revision: 1, status: "PAID", amount: 1500, days: 30, quote: { items: [] }, customer: { name: "Test", email: "", contact: "" }, note: "", staffNote: "", artworkUrl: "", targetUrl: "", startsAt: null, endsAt: null };
const event = (action: string): OrderEvent => ({ id: action, action: "ads_order_" + action, date: "2026-11-06T01:00:00Z", before: "PAID", after: "PAID", note: "test", role: "MANAGER", reference: null });
const simulated = (phase: ReturnType<typeof newSimulation>["phase"], status = "PAID") => ({ ...order, status, quote: { ...order.quote, simulation: { ...newSimulation(1500), phase } } });

describe("staff workflow evidence", () => {
  it("recognizes the persisted Stripe staff confirmation action", () => {
    const steps = orderWorkflow(order, [{ ...event("confirm_payment"), action: "stripe_banner_confirmed" }]);
    expect(steps[2]!.state).toBe("done");
    expect(steps[2]!.date).toBe("2026-11-06T01:00:00Z");
  });
  it("does not invent completed payment and review steps for legacy records", () => {
    const steps = orderWorkflow(order, []);
    expect(steps.map(s => s.state)).toEqual(["done", "unknown", "unknown", "current", "pending", "pending"]);
    expect(steps[1]!.date).toBeNull();
  });
  it("requires approval before a service start appears", () => {
    const current = simulated("approval");
    const steps = orderWorkflow(current, [event("sim_verify"), event("sim_install"), event("sim_review")]);
    expect(steps.map(s => s.state)).toEqual(["done", "done", "done", "done", "current"]);
    expect(actionOptions(current)[0]![0]).toBe("sim_activate");
    expect(steps.at(-1)?.date).toBeNull();
  });
  it("never shows an active next step for stopped orders but preserves history", () => {
    for (const status of ["EXPIRED", "REJECTED", "REFUNDED", "REFUND_REQUIRED"]) {
      const steps = orderWorkflow(simulated("installing", status), [event("sim_verify")]);
      expect(steps.some(s => s.state === "current")).toBe(false);
      expect(steps[1]!.state).toBe("done");
    }
  });
  it("shows the stored start date for active historical orders without inventing intermediate logs", () => {
    const steps = orderWorkflow({ ...simulated("active", "ACTIVE"), startsAt: "2026-11-06T03:00:00Z" }, []);
    expect(steps.map(s => s.state)).toEqual(["done", "unknown", "unknown", "unknown", "done"]);
    expect(steps.at(-1)?.date).toBe("2026-11-06T03:00:00Z");
  });
  it("does not offer verify before customer submission or when the amount mismatches", () => {
    expect(actionOptions(simulated("checkout", "PAYMENT")).some(([a]) => a === "sim_verify")).toBe(false);
    expect(actionOptions(simulated("submitted", "PAYMENT")).map(([a]) => a)).toEqual(["sim_retry", "sim_cancel"]);
  });
});
