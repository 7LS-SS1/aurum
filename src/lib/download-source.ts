import { load } from "cheerio";
import { safeFetch } from "@/lib/safe-http";
import { autoPlayerRecipe } from "@/lib/source-scanner/auto-markup";
import { ScannerError } from "@/lib/source-scanner/contracts";
import { readLimited, type SourceFetch } from "@/lib/source-scanner/network";

const types = {
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", mkv: "video/x-matroska",
} as const;
type Extension = keyof typeof types;
const htmlTypes = new Set(["text/html", "application/xhtml+xml"]);
const adSelectors = `${autoPlayerRecipe.ads}, [data-ad-slot], .adsbygoogle, .preroll, .video-ad, .video-ads, .vjs-ad-playing, [data-kind="preroll"], [data-kind="sponsor"]`;

export function mediaType(response: Response) {
  return response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
}

function publicUrl(value: string, base?: string) {
  let url: URL;
  try { url = new URL(value, base); } catch { throw new ScannerError("INVALID_URL"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.href.length > 2048) throw new ScannerError("INVALID_URL");
  url.hash = "";
  return url.href;
}

export function downloadFetcher(signal: AbortSignal): SourceFetch {
  return async (url) => {
    try {
      const response = await safeFetch(publicUrl(url), signal, { allowErrorStatus: true });
      if (response.status === 429) { await response.body?.cancel(); throw new ScannerError("RATE_LIMITED"); }
      if (!response.ok || response.status === 206 || !response.body) { await response.body?.cancel(); throw new ScannerError("SOURCE_HTTP"); }
      return response;
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error instanceof ScannerError) throw error;
      if (error instanceof Error && error.message === "ปลายทางไม่ใช่ที่อยู่สาธารณะ") throw new ScannerError("PRIVATE_ADDRESS");
      throw new ScannerError("SOURCE_HTTP");
    }
  };
}

/** Peek at the container header and put those bytes back for the uploader. */
async function openFile(response: Response, url: string, limit: number) {
  const body = response.body;
  if (!body) throw new ScannerError("SOURCE_HTTP");
  const rawLength = response.headers.get("content-length");
  const bytes = rawLength === null ? null : Number(rawLength);
  if (mediaType(response).startsWith("audio/")) { await body.cancel(); throw new ScannerError("INVALID_MEDIA"); }
  if (bytes !== null && bytes > limit) { await body.cancel(); throw new ScannerError("TOO_LARGE"); }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  try {
    let n = 0;
    while (n < 32) {
      const chunk = await reader.read();
      if (chunk.done) break;
      chunks.push(chunk.value);
      n += chunk.value.length;
    }
    const head = Buffer.concat(chunks.map((c) => c.subarray(0, 64))).subarray(0, 64);
    const header = head.toString("ascii", 4, 8);
    const brand = head.toString("ascii", 8, 12);
    const extFromUrl = new URL(url).pathname.match(/\.(mp4|webm|mov|mkv)$/i)?.[1]?.toLowerCase();
    const type = mediaType(response);
    let ext: Extension;
    if (head.length >= 8 && ["ftyp", "moov", "mdat", "wide", "free"].includes(header)) {
      if (header === "ftyp" && ["M4A ", "M4B ", "M4P "].includes(brand)) throw new ScannerError("INVALID_MEDIA");
      ext = type === types.mov || extFromUrl === "mov" || brand === "qt  " ? "mov" : "mp4";
    } else if (head.length >= 8 && head.readUInt32BE(0) === 0x1a45dfa3) {
      ext = type === types.webm || extFromUrl === "webm" || head.includes("webm") ? "webm" : "mkv";
    } else throw new ScannerError("INVALID_MEDIA");
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const buffered = chunks.shift();
        if (buffered) { controller.enqueue(buffered); return; }
        const next = await reader.read();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      },
      cancel: (reason) => reader.cancel(reason),
    });
    return { stream, ext, contentType: types[ext], bytes };
  } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
}

function player(html: string, base: string) {
  const $ = load(html);
  $(adSelectors).remove();
  const title = ($('meta[property="og:title"]').attr("content") || $("h1").first().text() || $("title").text()).trim().slice(0, 500);
  let content = $('video[data-kind="content"]');
  if (!content.length) content = $("video");
  const refs = content.toArray().flatMap((node) => [$(node).attr("src"), ...$(node).find("source[src]").toArray().map((item) => $(item).attr("src"))]);
  const meta = $('meta[property="og:video:secure_url"], meta[property="og:video:url"], meta[property="og:video"]').toArray()
    .map((node) => $(node).attr("content")).filter((value) => value && /\.(mp4|webm|mov|mkv|m3u8)(?:[?#]|$)/i.test(value));
  const media = [...new Set((refs.some(Boolean) ? refs : meta).filter((value): value is string => !!value).map((value) => publicUrl(value, base)))];
  if (content.length > 1 || media.length > 1) throw new ScannerError("AMBIGUOUS_MEDIA");
  if (media[0]) return { title, media: media[0], frame: undefined };
  const frames = $(autoPlayerRecipe.iframe!).toArray().map((node) => $(node).attr("src")).filter((value): value is string => !!value && value !== "about:blank");
  const frameUrls = [...new Set(frames.map((value) => publicUrl(value, base)))];
  if (frameUrls.length > 1) throw new ScannerError("AMBIGUOUS_MEDIA");
  return { title, media: undefined, frame: frameUrls[0] };
}

export async function resolveDownload(sourceUrl: string, fetcher: SourceFetch, limit: number) {
  let url = publicUrl(sourceUrl);
  let webpage = false;
  let title = "";
  let isMedia = false;
  const visited = new Set<string>();
  for (let hop = 0; hop < 5; hop++) {
    if (visited.has(url)) throw new ScannerError("UNSUPPORTED_PLAYER");
    visited.add(url);
    const response = await fetcher(url);
    const finalUrl = publicUrl(response.url || url);
    const type = mediaType(response);
    if (htmlTypes.has(type)) {
      if (isMedia) { await response.body?.cancel(); throw new ScannerError("UNSUPPORTED_PLAYER"); }
      webpage = true;
      const next = player((await readLimited(response, 2 * 1024 ** 2)).toString("utf8"), finalUrl);
      title ||= next.title;
      if (next.media) { url = next.media; isMedia = true; continue; }
      if (next.frame) { url = next.frame; continue; }
      throw new ScannerError("UNSUPPORTED_PLAYER");
    }
    if (/mpegurl/i.test(type) || /\.m3u8$/i.test(new URL(finalUrl).pathname)) {
      return { format: "hls" as const, response, mediaUrl: finalUrl, title, webpage, bytes: null };
    }
    const file = await openFile(response, finalUrl, limit);
    return { format: "file" as const, ...file, mediaUrl: finalUrl, title, webpage };
  }
  throw new ScannerError("UNSUPPORTED_PLAYER");
}
