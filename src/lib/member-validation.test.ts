import { describe, expect, it } from "vitest";
import { phoneSchema, safeMemberReturn } from "./member-validation";
describe("member identity inputs", () => {
  it("normalizes Thai mobile numbers to one E.164 identity", () => {
    expect(phoneSchema.parse("081-234-5678")).toBe("+66812345678");
    expect(phoneSchema.parse("+66 81 234 5678")).toBe("+66812345678");
    expect(phoneSchema.safeParse("123").success).toBe(false);
  });
  it.each(["https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)", "/admin", "/api/auth"])("does not redirect members to %s", value => {
    expect(safeMemberReturn(value)).toBe("/account");
  });
  it("retains legitimate purchase return paths", () => {
    expect(safeMemberReturn("/services/ads-banner/book")).toBe("/services/ads-banner/book");
  });
});
