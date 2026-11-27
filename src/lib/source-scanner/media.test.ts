import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/storage/stream-to-r2", () => ({ streamToR2: mocks.upload }));
vi.mock("@/lib/storage/r2", () => ({ deleteR2Object: mocks.remove, r2PublicUrl: (key: string) => `https://r2.test/${key}` }));
import { ingestMedia, runMediaTool } from "./media";

const available = spawnSync(process.env.FFMPEG_PATH || "ffmpeg", ["-version"], { windowsHide: true }).status === 0 && spawnSync(process.env.FFPROBE_PATH || "ffprobe", ["-version"], { windowsHide: true }).status === 0;
describe.skipIf(!available)("scanner real media pipeline (offline)", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "aurum-scanner-fixture-"));
    const signal = AbortSignal.timeout(30_000);
    await runMediaTool("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=160x90:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(dir, "video.mp4")], signal);
    await runMediaTool("ffmpeg", ["-v", "error", "-y", "-i", path.join(dir, "video.mp4"), "-c:v", "libvpx-vp9", path.join(dir, "video.webm")], signal);
    await runMediaTool("ffmpeg", ["-v", "error", "-y", "-i", path.join(dir, "video.mp4"), "-c", "copy", "-hls_time", "1", "-hls_playlist_type", "vod", "-hls_segment_filename", path.join(dir, "segment%d.ts"), path.join(dir, "video.m3u8")], signal);
    await writeFile(path.join(dir, "invalid.mp4"), "<html>Not a video</html>");
  }, 30_000);
  afterAll(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });
  beforeEach(() => {
    mocks.remove.mockReset().mockResolvedValue(undefined);
    mocks.upload.mockReset().mockImplementation(async (body: ReadableStream<Uint8Array>, _key: string, _type: string, _limit: number, signal: AbortSignal) => {
      signal.throwIfAborted(); const reader = body.getReader(); let bytes = 0;
      for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; }
      return bytes;
    });
  });
  async function fetcher(raw: string) {
    const name = path.basename(new URL(raw).pathname);
    const body = await readFile(path.join(dir, name));
    const res = new Response(body, { headers: { "content-type": name.endsWith("m3u8") ? "application/vnd.apple.mpegurl" : name.endsWith("ts") ? "video/mp2t" : name.endsWith("webm") ? "video/webm" : "video/mp4" } });
    Object.defineProperty(res, "url", { value: raw }); return res;
  }
  function options(ext = "mp4") {
    return { sourceId: "source", itemId: "item", mediaUrl: `https://fixture.test/video.${ext}`, coverUrl: null, maxBytes: 10_000_000, fetcher, signal: AbortSignal.timeout(15_000), progress: vi.fn().mockResolvedValue(undefined) };
  }
  for (const ext of ["mp4", "webm", "m3u8"]) it(`probes ${ext}, builds a cover and uploads only validated media`, async () => {
    const result = await ingestMedia(options(ext));
    expect(result.durationSec).toBeGreaterThan(0); expect(result.bytes).toBeGreaterThan(0);
    expect(result.videoUrl).toBe(`https://r2.test/videos/scan/source/item.${ext === "webm" ? "webm" : "mp4"}`);
    expect(mocks.upload).toHaveBeenCalledTimes(2);
  }, 20_000);
  it("rejects HTML disguised as MP4 before uploading", async () => {
    await expect(ingestMedia({ ...options(), mediaUrl: "https://fixture.test/invalid.mp4" })).rejects.toThrow();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("cleans uploaded objects when STOP interrupts upload", async () => {
    const controller = new AbortController();
    mocks.upload.mockImplementationOnce(async () => { controller.abort(new Error("STOP")); return 1; });
    await expect(ingestMedia({ ...options(), signal: controller.signal })).rejects.toThrow("STOP");
    expect(mocks.remove.mock.calls.map((c) => c[0])).toEqual(["videos/scan/source/item.mp4", "images/scan/source/item.jpg"]);
  });
});
