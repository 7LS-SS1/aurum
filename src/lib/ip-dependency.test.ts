import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
const ip = createRequire(path.join(process.cwd(), "node_modules/bittorrent-tracker/package.json"))("ip");
describe("tracker IP dependency regression", () => {
  it.each(["127.1", "01200034567", "012.1.2.3", "000:0:0000::01", "::fFFf:127.0.0.1"])("does not classify %s as public", address => {
    let publicAddress = false;
    try { publicAddress = ip.isPublic(address); } catch { /* Noncanonical addresses may be rejected. */ }
    expect(publicAddress).toBe(false);
  });
  it("retains tracker IPv4 and IPv6 buffer conversion", () => {
    for (const address of ["192.0.2.1", "2001:db8::1"]) {
      expect(ip.isEqual(ip.toString(ip.toBuffer(address)), address)).toBe(true);
    }
  });
});
