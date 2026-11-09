import { describe, expect, it } from "vitest";
import { normalizeRequestDomain } from "./website-request-domain";

describe("service inquiry domains", () => {
  it("accepts unregistered test names and normalizes IDNs", () => {
    expect(normalizeRequestDomain(" New-Site.example.test ")).toBe("new-site.example.test");
    expect(normalizeRequestDomain("ทดสอบ.com")).toBe(new URL("https://ทดสอบ.com").hostname);
    expect(normalizeRequestDomain("ทดสอบ.ไทย")).toBe(new URL("https://ทดสอบ.ไทย").hostname);
  });
  it.each(["", "localhost", "127.0.0.1", "https://example.com", "example.com/x", "user@example.com", "example.com:80", "a..test", "-a.test", "a_.test", "a.test?x", "a.test#x", "a%2etest", "a\\test", `${"a".repeat(64)}.test`, "a.test."])("rejects invalid hostname %s", value => {
    expect(normalizeRequestDomain(value)).toBeNull();
  });
});
