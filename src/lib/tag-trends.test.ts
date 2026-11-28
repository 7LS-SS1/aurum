import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { isSuggestable, matchTagsToTitle, rankTrending } from "./tag-trends";

describe("tag trends", () => {
  it("ranks growing tags and drops flat or one-off ones", () => {
    const ranked = rankTrending([
      { tag: "steady", recent: 10, previous: 10 },
      { tag: "rising", recent: 8, previous: 2 },
      { tag: "new", recent: 3, previous: 0 },
      { tag: "once", recent: 1, previous: 0 },
    ]);
    expect(ranked.map((row) => row.tag)).toEqual(["rising", "new"]);
  });
  it("suggests existing tags found in the title", () => {
    expect(matchTagsToTitle("คลิปเด็ด งานไทย สาวสวย", ["งานไทย", "สาวสวย", "AV", "ไทย"])).toEqual(["งานไทย", "สาวสวย", "ไทย"]);
    expect(matchTagsToTitle("", ["AV"])).toEqual([]);
  });
  it("never suggests violent, incest, minor or covert-recording tags", () => {
    for (const tag of ["ข่มขืน", "ครอบครัว", "เย็ดแม่", "พ่อเลี้ยง", "นักเรียน", "แอบถ่าย", "มอมยา", "Step Sis", "teen", "Rape"]) expect(isSuggestable(tag)).toBe(false);
    for (const tag of ["งานดี", "สาวสวย", "18+", "AV"]) expect(isSuggestable(tag)).toBe(true);
    expect(rankTrending([{ tag: "ข่มขืน", recent: 21, previous: 1 }])).toEqual([]);
  });
});
