import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { allowedUrl, mayContinue, mayStart, redactedUrl, retryAt, sourceSchema } from "./contracts";
import { parseListing, resolveItem, validateRecipe, type AdapterConfig, type DiscoveredItem } from "./adapters";
import { parseHls } from "./media";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const fixture = (name: string) => readFileSync(path.join(process.cwd(), "src/lib/source-scanner/fixtures", name), "utf8");
const config: AdapterConfig = { adapter: "HTML_RECIPE", allowedHosts: ["catalog.test", "cdn.test"], recipe: { videoLinks: ".video-link", next: "a[rel=next]", terminal: "[data-last-page=true]", title: "h1", description: ".description", media: "video", iframe: "iframe.player", cover: "meta[property='og:image']", tags: ".tags a", categories: ".categories a", ads: ".ad" } };
const item: DiscoveredItem = { externalId: "one", pageUrl: "https://catalog.test/watch/one", title: "", description: "", mediaUrl: null, coverUrl: null, tags: [], categories: [] };
describe("scanner adapters", () => {
  const auto = { ...config, adapter: "AUTO" as const, recipe: {} };
  it("discovers listings without a recipe and requires explicit end-of-catalog evidence", () => {
    expect(parseListing(fixture("list.html"), "https://catalog.test/catalog", auto)).toMatchObject({ items: [expect.objectContaining({ pageUrl: item.pageUrl })], next: "https://catalog.test/catalog?page=2", terminal: false });
    const links = '<article><h2><a href="/watch/one">Fixture</a></h2></article>';
    expect(parseListing(links + '<nav class="pagination"><span aria-current="page">3</span></nav>', item.pageUrl, auto)).toMatchObject({ paginationError: "PAGINATION_UNPROVEN", terminal: false });
    expect(parseListing(links + '<nav class="pagination"><button class="next" disabled>ถัดไป</button></nav>', item.pageUrl, auto)).toMatchObject({ terminal: true });
    expect(() => parseListing('<a data-video-page href="https://outside.test/watch">External</a>', item.pageUrl, auto)).toThrow(/INVALID_URL/);
  });
  it("resolves standard HTML video and reads 7m-storage JSON catalogs", async () => {
    await expect(resolveItem(item, auto, async () => new Response(fixture("player.html")))).resolves.toMatchObject({ title: "Fixture video", mediaUrl: "https://cdn.test/one.mp4?token=secret" });
    const json = { ...config, adapter: "JSON_CATALOG" as const, recipe: {} };
    const row = { id: "one", title: "Fixture", sourceUrl: "/watch/one", mediaUrl: "https://cdn.test/one.mp4", mainContent: true };
    expect(parseListing(JSON.stringify({ items: [row], next: ["/page2", "/page3"], terminal: false }), item.pageUrl, json))
      .toMatchObject({ items: [expect.objectContaining({ pageUrl: item.pageUrl })], next: "https://catalog.test/page2", additionalPages: ["https://catalog.test/page3"] });
    expect(() => parseListing(JSON.stringify({ items: [{ ...row, mainContent: false }], next: [], terminal: true }), item.pageUrl, json)).toThrow(/INVALID_RECIPE/);
  });
  it("validates selectors and required recipe fields", () => {
    expect(() => validateRecipe("HTML_RECIPE", { ...config.recipe as object, media: "[" })).toThrow();
    expect(() => validateRecipe("HTML_RECIPE", { title: "h1", next: ".next", terminal: ".end" })).toThrow();
    expect(() => validateRecipe("JSON_CATALOG", { items: "__proto__.items", id: "id", title: "title", next: "next", terminal: "end", mediaUrl: "url", pageUrl: "page" })).toThrow();
  });
  it("deduplicates links, removes ads, requires explicit pagination proof", () => {
    const listing = parseListing(fixture("list.html"), "https://catalog.test/catalog", config);
    expect(listing.items).toHaveLength(1); expect(listing.next).toBe("https://catalog.test/catalog?page=2");
    expect(parseListing(fixture("terminal.html"), item.pageUrl, config).terminal).toBe(true);
    expect(() => parseListing("<html></html>", item.pageUrl, config)).toThrow(/PAGINATION_UNPROVEN/);
    expect(() => parseListing(fixture("list.html") + fixture("terminal.html"), item.pageUrl, config)).toThrow(/INVALID_RECIPE/);
  });
  it("resolves ordinary media and metadata without changing text", async () => {
    const result = await resolveItem(item, config, async () => new Response(fixture("player.html")));
    expect(result).toMatchObject({ title: "Fixture video", mediaUrl: "https://cdn.test/one.mp4?token=secret", tags: ["Test"], categories: ["Demo"], coverUrl: "https://catalog.test/cover.jpg" });
  });
  it("refuses ambiguous media and disallowed iframe before fetching it", async () => {
    await expect(resolveItem(item, config, async () => new Response(fixture("ambiguous.html")))).rejects.toThrow(/AMBIGUOUS_MEDIA/);
    const fetcher = vi.fn(async () => new Response(fixture("iframe.html")));
    await expect(resolveItem(item, config, fetcher)).rejects.toThrow(/INVALID_URL/); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("bounds iframe nesting and loop traversal", async () => {
    const fetcher = vi.fn(async (url: string) => new Response(`<h1>Fixture</h1><iframe class="player" src="${url}/nested"></iframe>`));
    await expect(resolveItem(item, config, fetcher)).rejects.toThrow(/UNSUPPORTED_PLAYER/); expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("supports partner JSON dot paths and rejects string terminal values", () => {
    const jsonConfig: AdapterConfig = { ...config, adapter: "JSON_CATALOG", recipe: { items: "data.items", id: "id", title: "title", pageUrl: "page", mediaUrl: "media", terminal: "end", next: "next" } };
    const row = { id: 7, title: "Fixture", page: "/watch/7", media: "https://cdn.test/7.mp4" };
    const parsed = parseListing(JSON.stringify({ data: { items: [row] }, end: true }), item.pageUrl, jsonConfig);
    expect(parsed.items[0]?.title).toBe("Fixture"); expect(parsed.terminal).toBe(true);
    expect(() => parseListing(JSON.stringify({ data: { items: [] }, end: "true" }), item.pageUrl, jsonConfig)).toThrow(/PAGINATION_UNPROVEN/);
  });
});
describe("scanner controls", () => {
  const source = { control: "RUN", deletedAt: null, stopVersion: 1 };
  it("PAUSE stops new work while allowing current work; STOP invalidates old generations", () => {
    expect(mayStart(source)).toBe(true); expect(mayStart({ ...source, control: "PAUSE" })).toBe(false);
    expect(mayContinue({ ...source, control: "PAUSE" }, 1)).toBe(true);
    expect(mayContinue({ ...source, control: "STOP" }, 1)).toBe(false);
    expect(mayContinue({ ...source, stopVersion: 2 }, 1)).toBe(false);
  });
  it("accepts a source without rights metadata and backs off retries", () => {
    expect([1, 2, 3].map((n) => retryAt(n, 0).getTime())).toEqual([30000, 60000, 120000]);
    expect(sourceSchema.safeParse({ name: "fixture" }).success).toBe(false);
    const input = { name: "Fixture", baseUrl: "https://catalog.test", allowedHosts: ["catalog.test"], adapter: "HTML_RECIPE", recipe: config.recipe, mainCategory: "Demo" };
    expect(sourceSchema.safeParse(input).success).toBe(true);
  });
  it("allows exact HTTPS hosts only and hides query tokens in display", () => {
    for (const url of ["http://catalog.test", "https://catalog.test.evil.test", "https://user:pw@catalog.test", "https://catalog.test:8443"]) expect(() => allowedUrl(url, ["catalog.test"])).toThrow();
    expect(redactedUrl("https://catalog.test/file?token=secret")).not.toContain("secret");
  });
});
describe("HLS validation", () => {
  const vod = "#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,\nseg.ts\n#EXT-X-ENDLIST";
  it("accepts VOD, rejects live, encrypted, and ambiguous variant playlists", () => {
    expect(parseHls(vod).uris).toEqual(["seg.ts"]);
    expect(() => parseHls(vod.replace("#EXT-X-ENDLIST", ""))).toThrow(/UNSUPPORTED_PLAYER/);
    expect(() => parseHls(vod.replace("#EXTINF", '#EXT-X-KEY:METHOD=AES-128,URI="key"\n#EXTINF'))).toThrow(/UNSUPPORTED_PLAYER/);
    expect(() => parseHls("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\na.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=200\nb.m3u8")).toThrow(/AMBIGUOUS_MEDIA/);
  });
});
