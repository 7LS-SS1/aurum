import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ find: vi.fn(), check: vi.fn(), settings: vi.fn(), alert: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { stripeOrder: { findMany: mocks.find } } }));
vi.mock("./stripe-config", () => ({ stripeSettings: mocks.settings }));
vi.mock("./stripe-orders", () => ({ reconcileStripeOrder: mocks.check }));
vi.mock("./ads-notification-events", () => ({ orderAlert: mocks.alert }));
import { recoverStripePayments } from "./stripe-recovery";
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("STRIPE_RECONCILIATION_ENABLED", "true"); mocks.settings.mockReturnValue({ accountId: "acct_test" }); });
afterEach(() => vi.unstubAllEnvs());
it("is explicitly opt in and never calls providers while disabled", async () => {
  vi.stubEnv("STRIPE_RECONCILIATION_ENABLED", "false");
  expect((await recoverStripePayments()).enabled).toBe(false); expect(mocks.find).not.toHaveBeenCalled();
});
it("reports invalid configuration as degraded instead of silently skipping", async () => {
  mocks.settings.mockImplementation(() => { throw Error("invalid"); });
  expect(await recoverStripePayments()).toMatchObject({ failed: 1, configurationError: true });
});
it("continues after failures, advances the durable cursor, and flags uncertain creations", async () => {
  mocks.find.mockResolvedValue([{ id: "1", remoteId: "cs_test_1", bannerOrderId: "b1" }, { id: "2", remoteId: null, bannerOrderId: "b2" }, { id: "3", remoteId: "cs_test_3" }]);
  mocks.check.mockRejectedValueOnce(Error("network")).mockResolvedValueOnce({});
  expect(await recoverStripePayments("0")).toMatchObject({ checked: 1, failed: 2, cursor: "3" });
  expect(mocks.check).toHaveBeenCalledTimes(2); expect(mocks.alert).toHaveBeenCalledTimes(2);
  expect(mocks.find.mock.calls[0]![0]).toMatchObject({ take: 5, where: { accountId: "acct_test", id: { gt: "0" } } });
});
it("wraps its cursor so old paid orders are checked for missing refund events", async () => {
  mocks.find.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "1", remoteId: "in_test" }]);
  expect(await recoverStripePayments("9")).toMatchObject({ checked: 1, cursor: "1" });
  expect(mocks.find.mock.calls[1]![0].where.id).toBeUndefined();
});
