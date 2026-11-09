import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultAdsPage } from "@/lib/ads-page-config";
const mocks = vi.hoisted(() => ({ getAdsPage: vi.fn() }));
vi.mock("@/lib/ads-page-store", () => mocks);
import AdsBannerPage from "./page";

describe("public advertising promotions", () => {
  it("renders published posts and excludes drafts including their image URLs", async () => {
    mocks.getAdsPage.mockResolvedValue({ config: {
      ...defaultAdsPage,
      promotions: [
        { id: "draft", title: "PRIVATE_DRAFT", body: "PRIVATE_TERMS", imageUrl: "https://example.test/private.png", published: false },
        { id: "public", title: "PUBLIC_PROMOTION", body: "<script>alert(1)</script>", imageUrl: "", published: true },
      ],
    } });
    const html = renderToStaticMarkup(await AdsBannerPage());
    expect(html).toContain("PUBLIC_PROMOTION");
    expect(html).not.toContain("PRIVATE_DRAFT");
    expect(html).not.toContain("PRIVATE_TERMS");
    expect(html).not.toContain("private.png");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});
