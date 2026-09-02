/**
 * Unicode-aware slug regex — allows letters/numbers from any script (Thai
 * included) plus hyphens. Deliberately not ASCII-only: almost all content on
 * this platform has a Thai title, and an ASCII-only slug regex reduces every
 * Thai title to an empty string.
 */
export const SLUG_PATTERN = /^[\p{L}\p{N}\p{M}-]+$/u;
export const SLUG_PATTERN_MESSAGE = "slug must contain only letters, numbers, and hyphens";

/**
 * Builds a URL slug from a title, preserving non-Latin scripts (Thai, etc.)
 * instead of stripping them to nothing. Only Latin combining diacritics
 * (U+0300-U+036F) are stripped after NFKD normalization — Thai's own tone/
 * vowel marks (Unicode category Mark, not Letter) are explicitly kept via
 * \p{M} so words like "คลิป" don't get fragmented into "คล-ปหล-ด" by
 * treating every combining vowel/tone mark as a word separator.
 * Falls back to `${fallbackPrefix}-{timestamp}` only when the title has no
 * usable letters/numbers at all (e.g. an emoji-only or empty title).
 */
export function slugifyTitle(title: string, fallbackPrefix: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || `${fallbackPrefix}-${Date.now().toString(36)}`;
}
