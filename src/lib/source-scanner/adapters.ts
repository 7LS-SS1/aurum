import { createHash } from "node:crypto";
import { load } from "cheerio";
import { allowedUrl, Recipe, recipeSchema, ScannerError, standardCatalogRecipe } from "./contracts";
import { readLimited, SourceFetch } from "./network";
import { autoPlayerRecipe, discoverMarkup } from "./auto-markup";
import { resolveLumierePlayer } from "./lumiere-player";

export interface DiscoveredItem {
  externalId: string; pageUrl: string; title: string; description: string;
  mediaUrl: string | null; coverUrl: string | null; tags: string[]; categories: string[];
}
export interface Listing { items: DiscoveredItem[]; next: string | null; additionalPages?: string[]; terminal: boolean; paginationError?: "PAGINATION_UNPROVEN" }
export type AdapterConfig = { adapter: "AUTO" | "HTML_RECIPE" | "JSON_CATALOG"; recipe?: unknown; allowedHosts: unknown };
export function validateRecipe(adapter: AdapterConfig["adapter"], input: unknown): Recipe {
  if (adapter === "AUTO") return autoPlayerRecipe;
  const recipe = recipeSchema.parse(adapter === "JSON_CATALOG" && (input == null || Object.keys(input).length === 0) ? standardCatalogRecipe : input);
  try {
    if (adapter === "HTML_RECIPE") {
      if (!recipe.videoLinks || !recipe.media) throw 0;
      const $ = load("<html><body><div><a></a><video></video></div></body></html>");
      for (const selector of Object.values(recipe)) $(selector);
    } else {
      if (!recipe.items || !recipe.id || !recipe.mediaUrl || !recipe.pageUrl) throw 0;
      for (const path of Object.values(recipe)) if (!/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(path) || path.split(".").some((p) => ["__proto__", "prototype", "constructor"].includes(p))) throw 0;
    }
  } catch { throw new ScannerError("INVALID_RECIPE"); }
  return recipe;
}
function at(value: unknown, path?: string): unknown {
  if (!path) return undefined;
  return path.split(".").reduce<unknown>((obj, key) => obj && typeof obj === "object" && Object.hasOwn(obj, key) ? (obj as Record<string, unknown>)[key] : undefined, value);
}
const str = (value: unknown, max = 500) => typeof value === "string" ? value.trim().slice(0, max) : "";
const names = (value: unknown) => Array.isArray(value) ? [...new Set(value.map((v) => str(v, 120)).filter(Boolean))].slice(0, 50) : [];
export const externalId = (value: string) => createHash("sha256").update(value).digest("hex");
function one(values: string[]) {
  const unique = [...new Set(values.filter(Boolean))];
  if (unique.length > 1) throw new ScannerError("AMBIGUOUS_MEDIA");
  return unique[0] ?? null;
}
export function checkPagination(next: string | null, terminal: boolean) {
  if (terminal && next) throw new ScannerError("INVALID_RECIPE");
  if (!terminal && !next) throw new ScannerError("PAGINATION_UNPROVEN");
}
export function parseListing(body: string, pageUrl: string, config: AdapterConfig): Listing {
  const r = validateRecipe(config.adapter, config.recipe);
  const hosts = config.allowedHosts as string[];
  const url = (raw: string) => allowedUrl(raw, hosts, pageUrl);
  if (config.adapter === "AUTO") {
    const discovered = discoverMarkup(body, pageUrl, hosts);
    return { next: discovered.next, terminal: discovered.terminal, items: discovered.links.map(newHtmlItem),
      ...(!discovered.next && !discovered.terminal ? { paginationError: "PAGINATION_UNPROVEN" } : {}) };
  }
  if (config.adapter === "HTML_RECIPE") {
    const $ = load(body); if (r.ads) $(r.ads).remove();
    const links = [...new Set($(r.videoLinks!).toArray().map((el) => $(el).attr("href")).filter((v): v is string => !!v).map(url))];
    const next = one($(r.next).toArray().map((el) => $(el).attr("href") || "").filter(Boolean).map(url));
    const terminal = $(r.terminal).length > 0;
    checkPagination(next, terminal);
    return { items: links.map(newHtmlItem), next, terminal };
  }
  let bodyJson: unknown; try { bodyJson = JSON.parse(body); } catch { throw new ScannerError("INVALID_RECIPE"); }
  const rows = at(bodyJson, r.items);
  const standard = !config.recipe || Object.keys(config.recipe as object).length === 0;
  if (!Array.isArray(rows) || rows.length > (standard ? 1000 : 10000) || (standard && typeof at(bodyJson, r.terminal) !== "boolean")) throw new ScannerError("INVALID_RECIPE");
  const nextRaw = at(bodyJson, r.next);
  const nextValues = Array.isArray(nextRaw) ? nextRaw : nextRaw == null || nextRaw === "" ? [] : [nextRaw];
  if (nextValues.length > 1000 || nextValues.some((value) => typeof value !== "string" || !value.trim())) throw new ScannerError("INVALID_RECIPE");
  const [next = null, ...additionalPages] = [...new Set(nextValues.map(url))];
  const terminal = at(bodyJson, r.terminal) === true;
  checkPagination(next, terminal);
  const items = rows.map((row) => {
    const id = at(row, r.id); const title = str(at(row, r.title));
    const sourcePage = str(at(row, r.pageUrl), 2048);
    if (!(typeof id === "string" || typeof id === "number") || !String(id).trim() || !title || (standard ? at(row, "mainContent") !== true : !sourcePage)) throw new ScannerError("INVALID_RECIPE");
    const media = at(row, r.mediaUrl);
    if (Array.isArray(media)) { if (media.length > 1) throw new ScannerError("AMBIGUOUS_MEDIA"); }
    const mediaRaw = Array.isArray(media) ? media[0] : media;
    if (standard && (typeof mediaRaw !== "string" || !mediaRaw.trim())) throw new ScannerError("INVALID_RECIPE");
    return { externalId: externalId(String(id)), pageUrl: sourcePage ? url(sourcePage) : pageUrl, title,
      description: str(at(row, r.description), 20000), mediaUrl: typeof mediaRaw === "string" && mediaRaw ? url(mediaRaw) : null,
      coverUrl: str(at(row, r.coverUrl), 2048) ? url(str(at(row, r.coverUrl), 2048)) : null,
      tags: names(at(row, r.tags)), categories: names(at(row, r.categories)) };
  });
  return { items, next, terminal, ...(additionalPages.length ? { additionalPages } : {}) };
}
function newHtmlItem(link: string): DiscoveredItem {
  return { externalId: externalId(link), pageUrl: link, title: "", description: "", mediaUrl: null, coverUrl: null, tags: [], categories: [] };
}
export async function readListing(page: string, config: AdapterConfig, fetcher: SourceFetch) {
  const res = await fetcher(page);
  return parseListing((await readLimited(res, 5 * 1024 ** 2)).toString("utf8"), res.url || page, config);
}
export async function resolveItem(item: DiscoveredItem, config: AdapterConfig, fetcher: SourceFetch): Promise<DiscoveredItem> {
  if (config.adapter === "JSON_CATALOG") {
    if (!item.mediaUrl) throw new ScannerError("UNSUPPORTED_PLAYER");
    return { ...item, mediaUrl: allowedUrl(item.mediaUrl, config.allowedHosts as string[]) };
  }
  const r = validateRecipe(config.adapter, config.recipe);
  let current = item.pageUrl; const visited = new Set<string>();
  const result = { ...item };
  for (let depth = 0; depth <= 3; depth++) {
    if (visited.has(current)) throw new ScannerError("UNSUPPORTED_PLAYER");
    visited.add(current);
    const res = await fetcher(current);
    const base = res.url || current;
    const $ = load((await readLimited(res, 5 * 1024 ** 2)).toString("utf8"));
    if (r.ads) $(r.ads).remove();
    const txt = (selector?: string) => {
      if (!selector) return "";
      const element = $(selector).first();
      return (element.attr("content") ?? element.text()).trim();
    };
    if (depth === 0 || config.adapter === "AUTO") {
      result.title ||= txt(r.title).slice(0, 500);
      result.description ||= txt(r.description).slice(0, 20000);
      const terms = (selector?: string) => selector ? names($(selector).toArray().map((el) => $(el).text())) : [];
      if (!result.tags.length) result.tags = terms(r.tags);
      if (!result.categories.length) result.categories = terms(r.categories);
      const coverElement = r.cover ? $(r.cover).first() : null;
      const cover = coverElement?.attr("src") || coverElement?.attr("content") || coverElement?.attr("poster");
      if (!result.coverUrl && cover) result.coverUrl = allowedUrl(cover, config.allowedHosts as string[], base);
    }
    let mediaElements = $(r.media!);
    if (config.adapter === "AUTO") {
      const explicit = mediaElements.filter('video[data-kind="content"], video[data-kind="content"] source');
      if (explicit.length) mediaElements = explicit;
      if (new Set(mediaElements.toArray().map((el) => $(el).closest("video")[0])).size > 1) throw new ScannerError("AMBIGUOUS_MEDIA");
    }
    const urls = mediaElements.toArray().flatMap((el) => {
      const node = $(el); return [node.attr("src"), node.attr("href"), ...node.find("source[src]").toArray().map((child) => $(child).attr("src"))].filter((v): v is string => !!v);
    }).map((raw) => allowedUrl(raw, config.allowedHosts as string[], base));
    const media = one(urls) ?? (config.adapter === "AUTO"
      ? await resolveLumierePlayer($, base, config.allowedHosts as string[], fetcher)
      : null);
    if (media) { if (!result.title) throw new ScannerError("INVALID_RECIPE"); return { ...result, mediaUrl: media }; }
    const frames = r.iframe ? $(r.iframe).toArray().map((el) => {
      const frame = $(el);
      const src = frame.attr("src");
      return config.adapter === "AUTO" && (!src || src === "about:blank") ? frame.attr("data-src") : src;
    }).filter((v): v is string => !!v).map((raw) => allowedUrl(raw, config.allowedHosts as string[], base)) : [];
    const frame = one(frames);
    if (!frame || depth === 3) break;
    current = frame;
  }
  throw new ScannerError("UNSUPPORTED_PLAYER");
}
