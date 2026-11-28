import type { CheerioAPI } from "cheerio";
import { allowedUrl, ScannerError } from "./contracts";
import { parseHls } from "./media";
import { readLimited, type SourceFetch } from "./network";

const playerHost = "lumierecore.com";
const selectionHost = "px.lumierecore.com";

/** Read the provider's published playback selection without executing player scripts. */
export async function resolveLumierePlayer($: CheerioAPI, pageUrl: string, hosts: string[], fetcher: SourceFetch) {
  const page = new URL(pageUrl);
  const videoId = page.pathname.match(/^\/([a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})\/?$/i)?.[1];
  if (page.hostname !== playerHost || !videoId) return null;

  const configPath = "/player-config/v2/" + videoId + ".js";
  const declarations = new Set($("script[src]").toArray().flatMap((el) => {
    try {
      const url = new URL($(el).attr("src")!, page);
      return url.origin === page.origin && url.pathname === configPath ? [url.href] : [];
    } catch { return []; }
  }));
  if (!declarations.size) return null;
  if (declarations.size > 1) throw new ScannerError("AMBIGUOUS_MEDIA");
  const configUrl = allowedUrl(declarations.values().next().value!, hosts);

  const config = await fetcher(configUrl);
  if (config.url && config.url !== configUrl) {
    await config.body?.cancel();
    throw new ScannerError("UNSUPPORTED_PLAYER");
  }
  const script = (await readLimited(config, 128_000)).toString("utf8");
  const matches = [...script.matchAll(/^[ \t]*window\.PLAYER_PROXY_SELECTION_URL[ \t]*=[ \t]*("(?:[^"\\\r\n]|\\.)*")[ \t]*;/gm)];
  if (matches.length !== 1) throw new ScannerError("UNSUPPORTED_PLAYER");

  let selection: URL;
  try { selection = new URL(JSON.parse(matches[0]![1]!), page); }
  catch { throw new ScannerError("UNSUPPORTED_PLAYER"); }
  const selectionPath = "/api/proxy/" + videoId;
  if (![playerHost, selectionHost].includes(selection.hostname) || selection.pathname !== selectionPath || selection.search || selection.hash) {
    throw new ScannerError("UNSUPPORTED_PLAYER");
  }

  const response = await fetcher(allowedUrl(selection.href, hosts), "POST");
  let media: URL;
  let base: URL;
  try {
    const reply = JSON.parse((await readLimited(response, 64_000)).toString("utf8"));
    if (typeof reply.baseUrl !== "string" || typeof reply.masterUrl !== "string") throw new Error();
    base = new URL(reply.baseUrl);
    media = new URL(reply.masterUrl);
  } catch (error) {
    if (error instanceof ScannerError) throw error;
    throw new ScannerError("UNSUPPORTED_PLAYER");
  }
  if (base.href !== base.origin + "/" || media.origin !== base.origin
      || !media.pathname.startsWith("/hls/" + videoId + "/") || !media.pathname.endsWith(".m3u8")) {
    throw new ScannerError("UNSUPPORTED_PLAYER");
  }
  const manifest = await fetcher(allowedUrl(media.href, hosts));
  const manifestUrl = manifest.url || media.href;
  const parsed = parseHls((await readLimited(manifest, 2 * 1024 ** 2)).toString("utf8"), "lowest-bandwidth");
  return allowedUrl(parsed.variant ?? manifestUrl, hosts, manifestUrl);
}
