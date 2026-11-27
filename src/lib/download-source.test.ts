import { describe, expect, it, vi } from "vitest";
import { resolveDownload } from "./download-source";

const page = "https://catalog.test/watch/demo";
const cdn = "https://cdn.test/video.mp4";
const file = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.alloc(28)]);
const media = () => new Response(file, { headers: { "content-type": "video/mp4", "content-length": String(file.length) } });
const html = (text: string) => new Response(text, { headers: { "content-type": "text/html" } });

describe("automatic download link resolution", () => {
  it("checks the container header and preserves all bytes for streaming", async () => {
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(file.subarray(0, 6)); controller.enqueue(file.subarray(6)); controller.close();
    } });
    const result = await resolveDownload(cdn, async () => new Response(body), 1024);
    expect(result).toMatchObject({ webpage: false, mediaUrl: cdn, format: "file", ext: "mp4" });
    expect(result.format).toBe("file");
    if (result.format === "file") expect(Buffer.from(await new Response(result.stream).arrayBuffer())).toEqual(file);
  });

  it("ignores tagged ads and scripts and fetches only the https video on the page", async () => {
    const fetcher = vi.fn(async (url: string) => url === page ? html(`
      <h1>Demo</h1><div class="preroll"><video src="https://ad.test/promo.mp4"></video></div>
      <div data-ad-slot="slot"><iframe data-player src="https://ad.test/player"></iframe></div>
      <video><source src="${cdn}"></video><script>location.href = 'https://ad.test/pop'</script>`) : media());
    const result = await resolveDownload(page, fetcher, 1024);
    expect(result).toMatchObject({ webpage: true, mediaUrl: cdn, title: "Demo", format: "file" });
    expect(fetcher.mock.calls).toEqual([[page], [cdn]]);
    if (result.format === "file") await result.stream.cancel();
  });

  it("rejects ambiguous players, invalid media, and advertised sizes above the limit", async () => {
    await expect(resolveDownload(page, async () => html('<video src="/one.mp4"></video><video src="/two.mp4"></video>'), 1024)).rejects.toThrow(/AMBIGUOUS_MEDIA/);
    await expect(resolveDownload(cdn, async () => new Response("<html>Fake</html>", { headers: { "content-type": "video/mp4" } }), 1024)).rejects.toThrow(/INVALID_MEDIA/);
    await expect(resolveDownload(cdn, async () => media(), 12)).rejects.toThrow(/TOO_LARGE/);
  });

  it("bounds iframe loops and can pick a public HLS link from a standard player", async () => {
    await expect(resolveDownload(page, async () => html(`<iframe data-player src="${page}"></iframe>`), 1024)).rejects.toThrow(/UNSUPPORTED_PLAYER/);
    const playlist = "https://cdn.test/vod.m3u8";
    const result = await resolveDownload(page, async (url) => url === page ? html(`<video src="${playlist}"></video>`) : new Response("#EXTM3U", { headers: { "content-type": "application/vnd.apple.mpegurl" } }), 1024);
    expect(result).toMatchObject({ format: "hls", webpage: true, mediaUrl: playlist });
    if (result.format === "hls") await result.response.body?.cancel();
  });
});
