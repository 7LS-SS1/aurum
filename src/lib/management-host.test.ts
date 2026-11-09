import { describe, expect, it } from "vitest";
import { managementOrigin, managementRoute } from "./management-host";
const config = { enabled: true, origin: "https://system-management.aurum123.com", publicOrigin: "https://aurum123.com" };
describe("management host cutover", () => {
 it("is disabled by default and leaves public root alone", () => { expect(managementRoute(new URL(config.publicOrigin), config).kind).toBe("next"); expect(managementRoute(new URL(config.publicOrigin+"/admin"), {...config,enabled:false}).kind).toBe("next"); });
 it("rewrites management root to protected admin route", () => { expect(managementRoute(new URL(config.origin), config)).toEqual({kind:"rewrite",pathname:"/admin"}); });
 it("preserves deep links and query on the fixed trusted destination", () => { expect(managementRoute(new URL(config.publicOrigin+"/admin/ads-orders?group=pending"),config)).toMatchObject({kind:"redirect",target:config.origin+"/admin/ads-orders?group=pending"}); });
 it("never forwards POST credentials", () => { expect(managementRoute(new URL(config.publicOrigin+"/admin/login"),config,"POST").kind).toBe("reject"); });
 it("does not redirect unknown hosts or API requests", () => { expect(managementRoute(new URL("https://evil.example/admin"),config).kind).toBe("next"); expect(managementRoute(new URL(config.publicOrigin+"/api/public/account/orders"),config).kind).toBe("next"); });
 it("fails closed on invalid configuration", () => { for(const value of ["http://localhost","https://user:pass@example.com","https://example.com/x","https://example.com?x=1"])expect(managementOrigin(value)).toBeNull(); });
});
