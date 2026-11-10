import { describe, expect, it } from "vitest";
import { bulkTaxonomySchema, mergeTaxonomy } from "./bulk-taxonomy";
describe("bulk taxonomy", () => {
  it("preserves omitted fields and rejects empty changes", () => {
    const input = bulkTaxonomySchema.parse({ ids: ["a"], mode: "append", tags: ["new"] });
    expect(input.categories).toBeUndefined();
    expect(bulkTaxonomySchema.safeParse({ ids: ["a"], mode: "append" }).success).toBe(false);
  });
  it("adds without duplicates, replaces explicitly and removes only specified values", () => {
    expect(mergeTaxonomy(["ไทย", "HD"], ["ไทย", "ใหม่"], "append")).toEqual(["ไทย", "HD", "ใหม่"]);
    expect(mergeTaxonomy(["ไทย"], [], "replace")).toEqual([]);
    expect(mergeTaxonomy(["ไทย", "HD"], ["ไทย"], "remove")).toEqual(["HD"]);
  });
  it("enforces final taxonomy limits and bounded request size", () => {
    expect(() => mergeTaxonomy(Array.from({ length: 50 }, (_, i) => String(i)), ["new"], "append")).toThrow();
    expect(bulkTaxonomySchema.safeParse({ ids: Array(101).fill("a"), mode: "append", tags: [] }).success).toBe(false);
  });
});
