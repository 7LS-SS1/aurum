import { describe, expect, it } from "vitest";
import { draftFingerprint, normalizeApprovedTitle, requestFingerprint, sourceFingerprint } from "./fingerprints";

describe("content generation fingerprints", () => {
  it("is stable across taxonomy ordering and repeated whitespace", () => {
    const first = sourceFingerprint({
      title: "ABC-123  Actor Name",
      description: "บรรทัดแรก\r\nบรรทัดสอง",
      categories: ["AV", "ญี่ปุ่น"],
      tags: ["ใหม่", "HD"],
      actors: ["B", "A"],
    });
    const second = sourceFingerprint({
      title: "ABC-123 Actor Name",
      description: "บรรทัดแรก\nบรรทัดสอง",
      categories: ["ญี่ปุ่น", "AV"],
      tags: ["HD", "ใหม่", "ใหม่"],
      actors: ["A", "B"],
    });
    expect(first).toBe(second);
  });

  it("changes when an editable draft changes", () => {
    const base = { sourceFingerprint: "a".repeat(64), title: "ชื่อหนึ่ง", description: "รายละเอียด", focusKeyword: "คำหลัก" };
    expect(draftFingerprint(base)).not.toBe(draftFingerprint({ ...base, title: "ชื่อสอง" }));
  });

  it("normalizes titles for atomic same-site reservations", () => {
    expect(normalizeApprovedTitle("  TEST   Title  ")).toBe("test title");
  });

  it("makes request identity independent from input ordering", () => {
    const base = { provider: "grok", model: "grok-4.6", movieIds: ["m2", "m1"], siteIds: ["s2", "s1"], trendKeywords: ["ข", "ก"] };
    expect(requestFingerprint(base)).toBe(requestFingerprint({ ...base, movieIds: ["m1", "m2"], siteIds: ["s1", "s2"], trendKeywords: ["ก", "ข"] }));
  });
});
