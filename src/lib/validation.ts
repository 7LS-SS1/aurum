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
const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/x-matroska", "video/webm"]);
const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_VIDEO_BYTES = 8 * 1024 * 1024 * 1024; // 8 GB

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

export class ValidationError extends Error {}
