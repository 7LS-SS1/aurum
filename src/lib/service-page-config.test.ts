import { describe, expect, it } from "vitest";
import { defaultServicePage, renderServiceText, servicePageSchema } from "./service-page-config";
import { can } from "./permissions";

describe("service page configuration", () => {
  it("keeps current prices and resolves every contract placeholder", () => {
    expect(defaultServicePage.plans.map(p => p.monthly + defaultServicePage.hosting)).toEqual([4080, 4080, 6080]);
    expect(renderServiceText("สัญญา {contractMonths} เดือน / {contractMonths}", 6)).toBe("สัญญา 6 เดือน / 6");
  });
  it.each(["javascript:alert(1)", "https://t.me.evil.test/user", "http://t.me/thaitubevideo", "https://example.com/"])("rejects unsafe contact URL %s", telegram => {
    expect(servicePageSchema.safeParse({ ...defaultServicePage, telegram }).success).toBe(false);
  });
  it("rejects negative prices, missing copy, empty catalogue and fractional contracts", () => {
    for (const change of [{ hosting: -1 }, { copy: {} }, { plans: defaultServicePage.plans.map(p => ({ ...p, enabled: false })) }, { contractMonths: 1.5 }]) {
      expect(servicePageSchema.safeParse({ ...defaultServicePage, ...change }).success).toBe(false);
    }
  });
  it("allows only human managers and heads to manage service pricing", () => {
    for (const role of ["STAFF", "SENIOR", "SYSTEM"] as const) expect(can(role, "service:manage")).toBe(false);
    for (const role of ["MANAGER", "HEAD"] as const) expect(can(role, "service:manage")).toBe(true);
  });
});
