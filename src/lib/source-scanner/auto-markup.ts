import { load } from "cheerio";
import { allowedUrl, ScannerError, type Recipe } from "./contracts";

export const autoPlayerRecipe: Recipe = {
  next: 'a[rel~="next"][href]', terminal: '[data-terminal="true"], [data-last-page="true"]',
  title: 'h1, meta[property="og:title"]', description: 'meta[name="description"], meta[property="og:description"]',
  media: 'video[src], video source[src]',
  iframe: 'iframe[data-player], .responsive-player iframe, .video-player iframe, .wp-block-embed iframe',
  cover: 'meta[property="og:image"], video[poster]', tags: 'a[rel~="tag"]', categories: '[data-category], a[rel~="category"]',
  ads: '[data-kind="ad"], [data-ad], .ad, .advertisement, .ad-container, #video-ad, #video-ad-container',
};

// Prefer explicit video markup over generic card headings when both exist.
const linkPatterns = [
  'a[data-video-page][href], [itemtype$="VideoObject"] a[itemprop="url"][href]',
  '.loop-video a.post-video[href], .loop-video a.video-card[href], .video-item .item-thumbnail a[href], .video-card a[href], a.clip-link[href]:has(img), a.video-link[href]',
  '.pt-cv-ifield a.pt-cv-href-thumbnail[href], figure.image.is-16by9 a[href], figure.image.is-4by3 a[href]',
  'article h2 a[href], article h3 a[href], article > a[href]:has(.post-thumbnail)',
];
const pager = '.pagination, .wp-pagenavi, .paging-navigation, nav[aria-label="Pagination" i]';
const nextLabels = new Set(["next", "next page", "next page »", "หน้าถัดไป", "หน้าต่อไป", "ถัดไป", "»", "›"]);

export function discoverMarkup(body: string, pageUrl: string, hosts: string[]) {
  const $ = load(body);
  $(autoPlayerRecipe.ads!).remove();
  $('a[aria-disabled="true"], a.disabled').removeAttr("href");
  const pagers = $(pager);
  const nextLinks = $(`${autoPlayerRecipe.next}, link[rel~="next"][href]`).add(pagers.find('a.next[href], a.pagination-next[href], a[href]').filter((_index, el) => {
    const link = $(el);
    return link.is(".next, .pagination-next") || nextLabels.has(link.text().trim().replace(/\s+/g, " ").toLowerCase());
  }));
  const toUrl = (raw: string) => allowedUrl(raw, hosts, pageUrl);
  const links = [...new Set((linkPatterns.map((pattern) => $(pattern)).find((group) => group.length)?.toArray() ?? [])
    .map((el) => $(el).attr("href")?.trim()).filter((v): v is string => Boolean(v) && !/^(#|javascript:|mailto:)/i.test(v!)).map(toUrl))];
  const next = [...new Set(nextLinks.toArray().map((el) => $(el).attr("href")?.trim())
    .filter((v): v is string => Boolean(v) && !/^(#|javascript:)/i.test(v!)).map(toUrl))];
  if (next.length > 1) throw new ScannerError("PAGINATION_UNPROVEN");
  const terminal = $(autoPlayerRecipe.terminal).length > 0 || pagers.find('[rel~="next"][aria-disabled="true"], .next[aria-disabled="true"], .next.disabled, button.next:disabled, [rel~="last"][aria-current="page"]').length > 0;
  if (terminal && next.length) throw new ScannerError("PAGINATION_UNPROVEN");
  if (!links.length && !terminal) throw new ScannerError("AUTO_LINKS_NOT_FOUND");
  return { links, next: next[0] ?? null, terminal };
}
