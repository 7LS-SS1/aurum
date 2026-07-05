import { z } from "zod";

/** Shared string limits so a single bad request can't write unbounded rows. */
const shortText = z.string().trim().min(1).max(500);
const longText = z.string().trim().max(20_000).optional();
const urlField = z.string().trim().url().max(2048);
const taxonomyList = z.array(z.string().trim().min(1).max(120)).max(50);

export const createMovieSchema = z.object({
  title: shortText,
  slug: z
    .string()
    .trim()
    .max(500)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase alphanumeric with hyphens")
    .optional(),
  excerpt: longText,
  content: longText,
  mainCategory: z.string().trim().min(1).max(120).optional(),
  categories: taxonomyList.default([]),
  tags: taxonomyList.default([]),
  thumbnailUrl: urlField.optional(),
  previewUrl: urlField.optional(),
  iframeUrl: urlField.optional(),
  videoUrl: urlField.optional(),
  videoProvider: z.enum(["external", "bunny", "s3", "r2", "jwplayer"]).optional(),
  jwPlayerMediaId: z.string().trim().min(1).max(255).optional(),
  extraMeta: z.record(z.string(), z.unknown()).default({}),
  targetSiteIds: z.array(z.string().min(1)).max(200).default([]),
});
export type CreateMovieInput = z.infer<typeof createMovieSchema>;

export const updateMovieSchema = createMovieSchema.partial();

export const movieSiteDraftSchema = z.object({
  title: shortText.optional(),
  slug: z.string().trim().max(500).optional(),
  excerpt: longText,
  content: longText,
  categories: taxonomyList.optional(),
  tags: taxonomyList.optional(),
  extraMeta: z.record(z.string(), z.unknown()).optional(),
});
export type MovieSiteDraftInput = z.infer<typeof movieSiteDraftSchema>;

export const createSiteSchema = z.object({
  name: shortText,
  baseUrl: urlField,
  authType: z.enum(["APP_PASSWORD", "JWT"]).default("APP_PASSWORD"),
  wpUsername: z.string().trim().max(255).optional(),
  credential: z.string().trim().min(8).max(2048),
  postType: z.string().trim().min(1).max(100).default("posts"),
  categoryRestBase: z.string().trim().min(1).max(100).default("categories"),
  tagRestBase: z.string().trim().min(1).max(100).default("tags"),
  defaultStatus: z.enum(["publish", "draft", "pending"]).default("publish"),
});
export type CreateSiteInput = z.infer<typeof createSiteSchema>;

export const updateSiteSchema = createSiteSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const distributeSchema = z.object({
  siteIds: z.array(z.string().min(1)).min(1).max(200),
});

export const presignSchema = z.object({
  provider: z.enum(["r2", "bunny"]),
  filename: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(/^[^/\\]+$/, "filename must not contain path separators"),
  contentType: z.string().trim().min(1).max(255),
  size: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024 * 1024) // 10 GB hard ceiling
    .optional(),
});

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/x-matroska", "video/webm", "video/mp2t"]);
const THEME_PACKAGE_TYPES = new Set(["application/zip", "application/x-zip-compressed", "application/octet-stream"]);
const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_VIDEO_BYTES = 8 * 1024 * 1024 * 1024; // 8 GB
const MAX_THEME_PACKAGE_BYTES = 80 * 1024 * 1024; // 80 MB

export const reviewActionSchema = z.object({
  action: z.enum(["start", "ready"]),
});
export type ReviewActionInput = z.infer<typeof reviewActionSchema>;

export const rejectSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
});
export type RejectInput = z.infer<typeof rejectSchema>;

export const createPlayerConfigSchema = z.object({
  provider: z.enum(["JWPLAYER"]).default("JWPLAYER"),
  name: shortText,
  playerId: z.string().trim().min(1).max(255),
  // JWX/JWPlayer V2 Management API scopes every call under a site (property)
  // ID — stored in PlayerConfig.extraConfig.siteId, no schema migration needed.
  siteId: z.string().trim().min(1).max(255).optional(),
  libraryUrl: urlField.optional(),
  apiKey: z.string().trim().min(8).max(2048),
  apiSecret: z.string().trim().min(8).max(2048).optional(),
  defaultPosterMode: z.enum(["auto", "custom"]).default("auto"),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  extraConfig: z.record(z.string(), z.unknown()).default({}),
});
export type CreatePlayerConfigInput = z.infer<typeof createPlayerConfigSchema>;

export const updatePlayerConfigSchema = createPlayerConfigSchema.partial();
export type UpdatePlayerConfigInput = z.infer<typeof updatePlayerConfigSchema>;

export const createWordpressThemeSchema = z.object({
  name: shortText,
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase alphanumeric with hyphens"),
  version: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[0-9A-Za-z.+_-]+$/, "version contains unsupported characters"),
  description: longText,
  packageUrl: urlField,
  packageSize: z.number().int().positive().max(MAX_THEME_PACKAGE_BYTES).optional(),
  screenshotUrl: urlField.optional(),
  changelog: longText,
  isActive: z.boolean().default(true),
});
export type CreateWordpressThemeInput = z.infer<typeof createWordpressThemeSchema>;

export const updateWordpressThemeSchema = createWordpressThemeSchema.partial();
export type UpdateWordpressThemeInput = z.infer<typeof updateWordpressThemeSchema>;

export const wordpressThemePresignSchema = z.object({
  kind: z.enum(["package", "screenshot"]),
  filename: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(/^[^/\\]+$/, "filename must not contain path separators"),
  contentType: z.string().trim().min(1).max(255),
  size: z.number().int().positive().max(MAX_THEME_PACKAGE_BYTES).optional(),
});
export type WordpressThemePresignInput = z.infer<typeof wordpressThemePresignSchema>;

export const jwPlayerIngestSchema = z.object({
  sourceUrl: urlField,
  filename: z.string().trim().max(255).optional(),
  title: shortText.optional(),
  contentType: z.string().trim().max(255).optional(),
});
export type JwPlayerIngestInput = z.infer<typeof jwPlayerIngestSchema>;

export const viewerRegisterSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(8).max(255),
  displayName: z.string().trim().min(2).max(60),
});
export type ViewerRegisterInput = z.infer<typeof viewerRegisterSchema>;

export const viewerLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(1).max(255),
});
export type ViewerLoginInput = z.infer<typeof viewerLoginSchema>;

export const reactionSchema = z.object({
  type: z.enum(["LIKE", "DISLIKE"]),
});
export type ReactionInput = z.infer<typeof reactionSchema>;

export const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export function assertUploadAllowed(kind: "image" | "video", contentType: string, size?: number) {
  const allowed = kind === "image" ? IMAGE_TYPES : VIDEO_TYPES;
  if (!allowed.has(contentType)) {
    throw new ValidationError(`Unsupported ${kind} content-type: ${contentType}`);
  }
  const max = kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (size !== undefined && size > max) {
    throw new ValidationError(`${kind} exceeds maximum allowed size of ${max} bytes`);
  }
}

export function assertThemeUploadAllowed(kind: "package" | "screenshot", filename: string, contentType: string, size?: number) {
  if (kind === "screenshot") {
    assertUploadAllowed("image", contentType, size);
    return;
  }

  if (!filename.toLowerCase().endsWith(".zip") || !THEME_PACKAGE_TYPES.has(contentType)) {
    throw new ValidationError(`Unsupported theme package: ${contentType}`);
  }
  if (size !== undefined && size > MAX_THEME_PACKAGE_BYTES) {
    throw new ValidationError(`theme package exceeds maximum allowed size of ${MAX_THEME_PACKAGE_BYTES} bytes`);
  }
}

/**
 * R2 now stores both images (thumbnails) and source video (JWPlayer ingest
 * fetch-uploads that source video), so the presign route needs to infer kind
 * from contentType instead of assuming R2 == image.
 */
export function assertUploadAllowedAuto(contentType: string, size?: number): "image" | "video" {
  if (IMAGE_TYPES.has(contentType)) {
    assertUploadAllowed("image", contentType, size);
    return "image";
  }
  if (VIDEO_TYPES.has(contentType)) {
    assertUploadAllowed("video", contentType, size);
    return "video";
  }
  throw new ValidationError(`Unsupported content-type: ${contentType}`);
}

export class ValidationError extends Error {}
