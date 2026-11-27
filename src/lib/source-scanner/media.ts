import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import sharp from "sharp";
import { streamToR2 } from "@/lib/storage/stream-to-r2";
import { deleteR2Object, r2PublicUrl } from "@/lib/storage/r2";
import { ScannerError } from "./contracts";
import { readLimited, SourceFetch } from "./network";

export async function runMediaTool(tool: "ffmpeg" | "ffprobe", args: string[], signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<string>((resolve, reject) => {
    const child = spawn(process.env[tool === "ffmpeg" ? "FFMPEG_PATH" : "FFPROBE_PATH"] || tool, args, { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    let output = ""; let tooMuch = false;
    const abort = () => child.kill("SIGKILL");
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    child.stdout.on("data", (chunk) => { output += chunk.toString(); if (output.length > 1_000_000) { tooMuch = true; abort(); } });
    child.on("error", () => { signal.removeEventListener("abort", abort); reject(new ScannerError("MEDIA_TOOL")); });
    child.on("close", (code) => { signal.removeEventListener("abort", abort); if (signal.aborted) reject(signal.reason); else if (code !== 0 || tooMuch) reject(new ScannerError("MEDIA_TOOL")); else resolve(output); });
  });
}

export function parseHls(text: string) {
  const lines = text.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines[0] !== "#EXTM3U" || lines.some((l) => /^#EXT-X-(?:KEY|SESSION-KEY):/i.test(l) && l !== "#EXT-X-KEY:METHOD=NONE")) throw new ScannerError("UNSUPPORTED_PLAYER");
  if (lines.some((l) => /^#EXT-X-(?:MEDIA:|BYTERANGE:|PART:|PRELOAD-HINT:|SESSION-DATA:)/.test(l))) throw new ScannerError("UNSUPPORTED_PLAYER");
  const uris = lines.filter((l) => !l.startsWith("#"));
  if (lines.some((l) => l.startsWith("#EXT-X-STREAM-INF:"))) {
    if (uris.length !== 1) throw new ScannerError("AMBIGUOUS_MEDIA");
    return { variant: uris[0]!, lines: [] as string[], uris };
  }
  if (!lines.includes("#EXT-X-ENDLIST") || !uris.length || uris.length > 5000) throw new ScannerError("UNSUPPORTED_PLAYER");
  for (const line of lines) {
    if (line.startsWith("#EXT-X-MAP:") && (!/^#EXT-X-MAP:URI="[^"\r\n]+"$/.test(line))) throw new ScannerError("UNSUPPORTED_PLAYER");
    if (line.includes("URI=") && !line.startsWith("#EXT-X-MAP:")) throw new ScannerError("UNSUPPORTED_PLAYER");
    if (line.startsWith("#") && !/^#(?:EXTM3U$|EXTINF:|EXT-X-(?:VERSION:|TARGETDURATION:|MEDIA-SEQUENCE:|DISCONTINUITY-SEQUENCE:|PLAYLIST-TYPE:|ENDLIST$|DISCONTINUITY$|INDEPENDENT-SEGMENTS$|PROGRAM-DATE-TIME:|MAP:|KEY:METHOD=NONE$))/.test(line)) throw new ScannerError("UNSUPPORTED_PLAYER");
  }
  return { variant: null, lines, uris };
}

export async function probe(file: string, signal: AbortSignal) {
  const raw = await runMediaTool("ffprobe", ["-v", "error", "-protocol_whitelist", "file", "-format_whitelist", "mov,matroska,webm", "-show_streams", "-show_format", "-of", "json", file], signal);
  const info = JSON.parse(raw) as { streams?: { codec_type?: string }[]; format?: { duration?: string } };
  const duration = Number(info.format?.duration);
  if (!info.streams?.some((s) => s.codec_type === "video") || !Number.isFinite(duration) || duration <= 0) throw new ScannerError("INVALID_MEDIA");
  return duration;
}

export async function readVodPlaylist(response: Response, url: string, fetcher: SourceFetch) {
  let base = response.url || url;
  let parsed = parseHls((await readLimited(response, 2 * 1024 ** 2)).toString("utf8"));
  if (parsed.variant) {
    const next = new URL(parsed.variant, base).toString();
    const variant = await fetcher(next);
    base = variant.url || next;
    parsed = parseHls((await readLimited(variant, 2 * 1024 ** 2)).toString("utf8"));
    if (parsed.variant) throw new ScannerError("UNSUPPORTED_PLAYER");
  }
  return { base, lines: parsed.lines };
}

export async function ingestMedia(opts: {
  sourceId: string; itemId: string; mediaUrl: string; coverUrl: string | null; maxBytes: number;
  fetcher: SourceFetch; signal: AbortSignal; progress: (bytes: number) => Promise<void>;
  initialResponse?: Response; storage?: "auto";
}) {
  const dir = await mkdtemp(path.join(tmpdir(), "aurum-scan-"));
  const keys: string[] = []; let total = 0; let lastProgress = 0;
  async function save(res: Response, filename: string) {
    if (!res.body) throw new ScannerError("SOURCE_HTTP");
    if (Number(res.headers.get("content-length")) + total > opts.maxBytes) { await res.body.cancel(); throw new ScannerError("TOO_LARGE"); }
    const reader = res.body.getReader(); const file = await open(filename, "w");
    try {
      for (;;) {
        opts.signal.throwIfAborted(); const { value, done } = await reader.read(); if (done) break;
        total += value.length; if (total > opts.maxBytes) throw new ScannerError("TOO_LARGE");
        await file.writeFile(value);
        if (Date.now() - lastProgress > 1000) { await opts.progress(total); lastProgress = Date.now(); }
      }
    } finally { await file.close(); await reader.cancel().catch(() => undefined); }
  }
  const cleanupObjects = async () => { for (const key of keys) await deleteR2Object(key).catch(() => undefined); };
  try {
    const res = opts.initialResponse ?? await opts.fetcher(opts.mediaUrl);
    const type = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || "";
    const isHls = /(?:mpegurl)/i.test(type) || /\.m3u8$/i.test(new URL(res.url || opts.mediaUrl).pathname);
    let ext = "mp4"; let file = path.join(dir, "video.mp4");
    if (isHls) {
      const { base, lines } = await readVodPlaylist(res, opts.mediaUrl, opts.fetcher);
      const local: string[] = []; let index = 0;
      for (const line of lines) {
        if (!line.startsWith("#") || line.startsWith("#EXT-X-MAP:")) {
          const map = line.startsWith("#"); const uri = map ? line.match(/URI="([^"]+)"/)![1]! : line;
          const name = `segment-${index++}.${map ? "mp4" : "ts"}`;
          await save(await opts.fetcher(new URL(uri, base).toString()), path.join(dir, name));
          local.push(map ? `#EXT-X-MAP:URI="${name}"` : name);
        } else local.push(line);
      }
      const playlist = path.join(dir, "local.m3u8"); await writeFile(playlist, local.join("\n"));
      await runMediaTool("ffmpeg", ["-v", "error", "-nostdin", "-y", "-protocol_whitelist", "file", "-format_whitelist", "hls,mpegts,mov", "-i", playlist, "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", "-movflags", "+faststart", "-fs", String(opts.maxBytes + 1), file], opts.signal);
    } else {
      if (type && !["video/mp4", "video/webm", "application/octet-stream", "binary/octet-stream"].includes(type)) { await res.body?.cancel(); throw new ScannerError("UNSUPPORTED_PLAYER"); }
      ext = type === "video/webm" || /\.webm$/i.test(new URL(res.url || opts.mediaUrl).pathname) ? "webm" : "mp4";
      file = path.join(dir, `video.${ext}`); await save(res, file);
    }
    const bytes = (await stat(file)).size;
    if (!bytes || bytes > opts.maxBytes) throw new ScannerError("TOO_LARGE");
    const durationSec = await probe(file, opts.signal);
    let cover: Buffer;
    if (opts.coverUrl) {
      const image = await readLimited(await opts.fetcher(opts.coverUrl), 15 * 1024 ** 2);
      cover = await sharp(image, { limitInputPixels: 40_000_000 }).resize(1280, 720, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    } else {
      const jpg = path.join(dir, "cover.jpg");
      await runMediaTool("ffmpeg", ["-v", "error", "-nostdin", "-y", "-protocol_whitelist", "file", "-format_whitelist", "mov,matroska,webm", "-ss", String(Math.min(1, durationSec / 2)), "-i", file, "-frames:v", "1", "-vf", "scale=1280:-2", jpg], opts.signal);
      cover = await readFile(jpg);
    }
    const folder = opts.storage === "auto" ? "auto" : `scan/${opts.sourceId}`;
    const videoKey = `videos/${folder}/${opts.itemId}.${ext}`;
    const coverKey = `images/${folder}/${opts.itemId}.jpg`;
    // Register before upload so an ambiguous completion also gets cleaned up.
    keys.push(videoKey, coverKey);
    await streamToR2(Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>, videoKey, `video/${ext}`, opts.maxBytes, opts.signal);
    await streamToR2(new ReadableStream({ start(c) { c.enqueue(cover); c.close(); } }), coverKey, "image/jpeg", 15 * 1024 ** 2, opts.signal);
    await opts.progress(bytes);
    return { videoUrl: r2PublicUrl(videoKey), thumbnailUrl: r2PublicUrl(coverKey), bytes, durationSec, cleanup: cleanupObjects };
  } catch (error) { await cleanupObjects(); throw error; }
  finally { await rm(dir, { recursive: true, force: true }); }
}
