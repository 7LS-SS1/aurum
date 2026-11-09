import { describe, expect, it } from "vitest";
import { adsPageSchema, defaultAdsPage } from "./ads-page-config";

describe("advertising configuration", () => {
  const post = { id: "efec8916-dd9c-490f-a257-354ea72d12c5", title: "Promotion", body: "Terms", imageUrl: "", published: false };
  it("retains approved rates independently of website subscriptions", () => {
    expect(defaultAdsPage.groups.map(group => group.total)).toEqual([10000, 41000, 27000]);
    expect(defaultAdsPage.packages.map(plan => plan.price)).toEqual([78000, 210600, 374400]);
    expect(defaultAdsPage.promotions).toEqual([]);
  });
  it.each(["javascript:alert(1)", "data:image/svg+xml,test", "//evil.test/image", "http://example.test/image"])("rejects unsafe promotion image %s", imageUrl => {
    expect(adsPageSchema.safeParse({ ...defaultAdsPage, promotions: [{ ...post, imageUrl }] }).success).toBe(false);
  });
  it("accepts drafts and published posts, rejects duplicate IDs and blank content", () => {
    for (const published of [true, false]) expect(adsPageSchema.safeParse({ ...defaultAdsPage, promotions: [{ ...post, published }] }).success).toBe(true);
    expect(adsPageSchema.safeParse({ ...defaultAdsPage, promotions: [post, post] }).success).toBe(false);
    expect(adsPageSchema.safeParse({ ...defaultAdsPage, promotions: [{ ...post, body: " " }] }).success).toBe(false);
  });
});
