import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { enqueueSchema, isPublicAddress } from "./auto-download";

describe("auto download", () => {
  it("rejects private and loopback addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.1.1", "172.20.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1"]) expect(isPublicAddress(ip)).toBe(false);
    for (const ip of ["1.1.1.1", "104.16.0.1", "2606:4700::1111"]) expect(isPublicAddress(ip)).toBe(true);
  });
  it("requires HTTPS media URLs", () => {
    expect(() => enqueueSchema.parse({ mainCategory: "AV", items: [{ sourceUrl: "http://x.test/a.mp4" }] })).toThrow();
    expect(enqueueSchema.parse({ mainCategory: "AV", items: [{ sourceUrl: "https://x.test/a.mp4", thumbnailUrl: "" }] }).items[0]?.thumbnailUrl).toBeUndefined();
  });
});
