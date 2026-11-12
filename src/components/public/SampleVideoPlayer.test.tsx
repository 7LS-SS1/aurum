import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SampleVideoPlayer } from "./SampleVideoPlayer";

describe("sample access", () => {
  it("requires explicit start for guest embeds and preserves the return destination", () => {
    const html = renderToStaticMarkup(<SampleVideoPlayer member={false} movieKey="demo" title="Demo" iframeUrl="https://example.test/player" />);
    expect(html).not.toContain("<iframe");
    expect(html).toContain("15 วินาที");
    expect(html).toContain("/register?callbackUrl=%2Fwatch%2Fdemo");
    expect(html).toContain("/login?callbackUrl=%2Fwatch%2Fdemo");
  });
  it("renders full playback for an authenticated member", () => {
    const html = renderToStaticMarkup(<SampleVideoPlayer member movieKey="demo" title="Demo" iframeUrl="https://example.test/player" />);
    expect(html).toContain('<iframe src="https://example.test/player"');
    expect(html).not.toContain("เริ่มดูตัวอย่าง");
  });
});
