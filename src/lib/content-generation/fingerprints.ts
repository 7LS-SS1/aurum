import { createHash } from "node:crypto";

export interface ContentSourceSnapshot {
  title: string;
  description: string;
  categories: string[];
  tags: string[];
  actors: string[];
}

export interface ContentDraftSnapshot {
  sourceFingerprint: string;
  title: string;
  description: string;
  focusKeyword: string;
}

function normalizedWords(values: string[]): string[] {
  return [...new Set(values.map(value => value.normalize("NFKC").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "th"));
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function normalizeApprovedTitle(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("th");
}

export function normalizeSourceSnapshot(source: ContentSourceSnapshot): ContentSourceSnapshot {
  return {
    title: source.title.normalize("NFKC").trim().replace(/\s+/g, " "),
    description: source.description.normalize("NFKC").trim().replace(/\r\n/g, "\n"),
    categories: normalizedWords(source.categories),
    tags: normalizedWords(source.tags),
    actors: normalizedWords(source.actors),
  };
}

export function sourceFingerprint(source: ContentSourceSnapshot): string {
  return digest(normalizeSourceSnapshot(source));
}

export function draftFingerprint(draft: ContentDraftSnapshot): string {
  return digest({
    sourceFingerprint: draft.sourceFingerprint,
    title: draft.title.normalize("NFKC").trim().replace(/\s+/g, " "),
    description: draft.description.normalize("NFKC").trim().replace(/\r\n/g, "\n"),
    focusKeyword: draft.focusKeyword.normalize("NFKC").trim().replace(/\s+/g, " "),
  });
}

export function requestFingerprint(input: {
  provider: string;
  model: string;
  movieIds: string[];
  siteIds: string[];
  trendKeywords: string[];
}): string {
  return digest({
    provider: input.provider,
    model: input.model,
    movieIds: [...new Set(input.movieIds)].sort(),
    siteIds: [...new Set(input.siteIds)].sort(),
    trendKeywords: normalizedWords(input.trendKeywords),
  });
}

export function itemIdempotencyKey(jobKey: string, movieId: string, siteId: string): string {
  return digest({ jobKey, movieId, siteId });
}
