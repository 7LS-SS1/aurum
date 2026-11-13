import { describe, expect, it, vi } from "vitest";
const settings = vi.hoisted(() => ({ AURUM_PUBLIC_HOSTNAME: "https://aurum123.com/" }));
vi.mock("@/lib/env", () => ({ env: () => settings }));
import { buildReferrerDomains } from "./bunny-referrers";
describe("Bunny public referrer configuration", () => {
  it("normalizes a URL to hostnames and includes www", () => {
    expect(buildReferrerDomains([])).toEqual(["aurum123.com", "www.aurum123.com"]);
  });
  it("retains connected site hostnames", () => {
    expect(buildReferrerDomains(["https://example.com/path"])).toEqual(["aurum123.com", "www.aurum123.com", "example.com", "www.example.com"]);
  });
});
