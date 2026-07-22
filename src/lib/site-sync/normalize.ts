/**
 * Normalization helpers for old-video-sync duplicate matching (see match.ts).
 * Deliberately conservative — every function here does exact, deterministic
 * normalization (whitespace/case/entity decoding), never fuzzy comparison,
 * because a false-positive match here means an operator loses a real
 * publish and a false negative "only" means a harmless duplicate warning.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

/** Decodes the small set of HTML entities WordPress actually emits in `title.rendered`/`_fields=title`. */
export function decodeHtmlEntities(value: string): string {
  if (!value) return value;
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body[0] === "#") {
      const isHex = body[1] === "x" || body[1] === "X";
      const codePoint = Number.parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return NAMED_ENTITIES[body] ?? match;
  });
}

/** Exact (non-fuzzy) title key: decode entities, trim, collapse internal whitespace, case-fold for comparison. */
export function normalizeTitle(value: string | null | undefined): string {
  if (!value) return "";
  return decodeHtmlEntities(value)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizeSlug(value: string | null | undefined): string {
  if (!value) return "";
  return value.trim().toLowerCase();
}

/**
 * Canonicalizes a video URL for comparison without changing what it points
 * to: scheme and host are case-folded (both are case-insensitive per RFC
 * 3986), a single trailing slash is dropped, but the path/query are left
 * byte-for-byte as-is since a CDN media ID embedded there can be
 * case-sensitive. Returns null for empty input so callers can skip the
 * video-url match strategy entirely rather than matching on empty string.
 */
export function canonicalizeVideoUrl(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null;
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
    return `${url.protocol.toLowerCase()}//${url.host.toLowerCase()}${pathname}${url.search}`;
  } catch {
    // Not an absolute URL (e.g. a bare CDN path) — compare the trimmed
    // string as-is rather than dropping the candidate entirely.
    return trimmed;
  }
}
