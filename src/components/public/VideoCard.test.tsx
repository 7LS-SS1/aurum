import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { VideoCard } from "./VideoCard";

describe("catalog watch links", () => {
  it("uses the stable ID even when the movie has a Thai slug", () => {
    const html = renderToStaticMarkup(<VideoCard movie={{ id: "movie-123", slug: "วิดีโอตัวอย่าง", title: "ตัวอย่าง", mainCategory: null, thumbnailUrl: null, previewUrl: null, extraMeta: {}, createdAt: "2026-11-13" }} />);
    expect(html).toContain('href="/watch/movie-123"');
    expect(html).not.toContain('href="/watch/วิดีโอตัวอย่าง"');
  });
});
