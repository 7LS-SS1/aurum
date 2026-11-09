/** Public site addresses only; credentials, queries and fragments never leave AURUM. */
export function sitePreviewUrl(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (!hostname.includes(".") || hostname.includes(":") || /^[\d.]+$/.test(hostname) || /\.(localhost|local|internal|test|invalid|example)$/.test(hostname)) return null;
    url.search = "";
    url.hash = "";
    return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url.href)}?w=640&h=400`;
  } catch { return null; }
}
