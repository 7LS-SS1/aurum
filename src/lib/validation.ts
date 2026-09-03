import { z } from "zod";
import { SLUG_PATTERN, SLUG_PATTERN_MESSAGE, slugifyTitle } from "@/lib/slug";

/** Shared string limits so a single bad request can't write unbounded rows. */
const shortText = z.string().trim().min(1).max(500);
const longText = z.string().trim().max(20_000).optional();
const urlField = z.string().trim().url().max(2048);
const taxonomyList = z.array(z.string().trim().min(1).max(120)).max(50);

/**
 * Admins commonly paste a filename or title into the optional URL field. It
 * can contain spaces, dots, underscores, emoji, or Thai text; normalize it
 * before validation so a cosmetic URL value can never block a video publish.
 */
const movieSlugField = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed ? slugifyTitle(trimmed, "video") : undefined;
  },
  z.string().trim().min(1).max(500).regex(SLUG_PATTERN, SLUG_PATTERN_MESSAGE).optional(),
);

export const createMovieSchema = z.object({
  title: shortText,
  slug: movieSlugField,
  excerpt: longText,
  content: longText,
  mainCategory: z.string().trim().min(1).max(120),
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
  actorIds: z.array(z.string().min(1)).max(50).default([]),
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
  mainCategories: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
});
export type CreateSiteInput = z.infer<typeof createSiteSchema>;

export const updateSiteSchema = createSiteSchema.partial().extend({
  isActive: z.boolean().optional(),
});

/** Doujin/Comic's own destination-site schema — deliberately separate from createSiteSchema (video), same shape with comicTypes replacing mainCategories. */
export const createComicSiteSchema = z.object({
  name: shortText,
  baseUrl: urlField,
  authType: z.enum(["APP_PASSWORD", "JWT"]).default("APP_PASSWORD"),
  wpUsername: z.string().trim().max(255).optional(),
  credential: z.string().trim().min(8).max(2048),
  postType: z.string().trim().min(1).max(100).default("posts"),
  categoryRestBase: z.string().trim().min(1).max(100).default("categories"),
  tagRestBase: z.string().trim().min(1).max(100).default("tags"),
  defaultStatus: z.enum(["publish", "draft", "pending"]).default("publish"),
  comicTypes: z.array(z.enum(["MANGA", "DOUJIN"])).max(2).default([]),
});
export type CreateComicSiteInput = z.infer<typeof createComicSiteSchema>;

export const updateComicSiteSchema = createComicSiteSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const distributeSchema = z.object({
  siteIds: z.array(z.string().min(1)).min(1).max(200),
});

export const syncJobsBatchSchema = z.object({
  siteIds: z.array(z.string().min(1)).min(1).max(50),
});
export type SyncJobsBatchInput = z.infer<typeof syncJobsBatchSchema>;

export const jobLogsQuerySchema = z.object({
  afterId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
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

/** Batch presign for comic chapter page uploads — a chapter can have 20-40 images, so one rate-limited request issues every URL instead of looping the single-file presign endpoint. */
export const presignBatchSchema = z
  .array(
    z.object({
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
        .max(10 * 1024 * 1024 * 1024)
        .optional(),
    }),
  )
  .min(1)
  .max(60);
export type PresignBatchInput = z.infer<typeof presignBatchSchema>;

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

const manageableRoleSchema = z.enum(["STAFF", "SENIOR", "MANAGER"]);

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const createMainCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export type CreateMainCategoryInput = z.infer<typeof createMainCategorySchema>;

export const updateMainCategorySchema = createMainCategorySchema;
export type UpdateMainCategoryInput = z.infer<typeof updateMainCategorySchema>;

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(8).max(255),
  name: z.string().trim().min(1).max(255).optional(),
  role: manageableRoleSchema.default("STAFF"),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255).optional(),
  password: z.string().min(8).max(255).optional(),
  name: z.string().trim().min(1).max(255).nullable().optional(),
  role: manageableRoleSchema.optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

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

export const createActorSchema = z.object({
  name: shortText,
  age: z.number().int().min(0).max(150).optional(),
  heightCm: z.number().int().min(0).max(300).optional(),
  weightKg: z.number().int().min(0).max(500).optional(),
  measurementBust: z.string().trim().max(60).optional(),
  measurementWaist: z.string().trim().max(60).optional(),
  measurementHip: z.string().trim().max(60).optional(),
  bio: longText,
  profileImageUrl: urlField.optional(),
});
export type CreateActorInput = z.infer<typeof createActorSchema>;

export const updateActorSchema = createActorSchema.partial();
export type UpdateActorInput = z.infer<typeof updateActorSchema>;

/** `name` accepts one tag or several comma-separated names in a single request (the "เพิ่มแท็กใหม่ ... ใช้ ," bulk-add requirement). */
export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(500),
});
export type CreateTagInput = z.infer<typeof createTagSchema>;

export const updateTagSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export type UpdateTagInput = z.infer<typeof updateTagSchema>;

const slugField = z
  .string()
  .trim()
  .max(500)
  .regex(SLUG_PATTERN, SLUG_PATTERN_MESSAGE)
  .optional();

export const createComicSeriesSchema = z.object({
  title: shortText,
  slug: slugField,
  description: longText,
});
export type CreateComicSeriesInput = z.infer<typeof createComicSeriesSchema>;

export const updateComicSeriesSchema = createComicSeriesSchema.partial();
export type UpdateComicSeriesInput = z.infer<typeof updateComicSeriesSchema>;

export const createComicCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export type CreateComicCategoryInput = z.infer<typeof createComicCategorySchema>;

export const updateComicCategorySchema = createComicCategorySchema;
export type UpdateComicCategoryInput = z.infer<typeof updateComicCategorySchema>;

/** `name` accepts one tag or several comma-separated names in a single request, same bulk-add convention as createTagSchema. */
export const createComicTagSchema = z.object({
  name: z.string().trim().min(1).max(500),
});
export type CreateComicTagInput = z.infer<typeof createComicTagSchema>;

export const updateComicTagSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export type UpdateComicTagInput = z.infer<typeof updateComicTagSchema>;

export const createComicSchema = z.object({
  title: shortText,
  slug: slugField,
  altTitles: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  description: longText,
  authorName: z.string().trim().max(255).optional(),
  comicType: z.enum(["MANGA", "DOUJIN"]).default("DOUJIN"),
  status: z.enum(["ONGOING", "COMPLETED", "HIATUS"]).default("ONGOING"),
  isOneShot: z.boolean().default(false),
  coverImageUrl: urlField.optional(),
  coverObjectKey: z.string().trim().max(1024).optional(),
  seriesId: z.string().trim().min(1).optional().nullable(),
  categoryIds: z.array(z.string().min(1)).max(50).default([]),
  tags: taxonomyList.default([]),
});
export type CreateComicInput = z.infer<typeof createComicSchema>;

export const updateComicSchema = createComicSchema.partial();

export const createComicChapterSchema = z.object({
  comicId: z.string().trim().min(1),
  number: z.string().trim().min(1).max(50),
  title: z.string().trim().max(500).optional(),
  publishedAt: z.coerce.date().optional(),
});
export type CreateComicChapterInput = z.infer<typeof createComicChapterSchema>;

export const updateComicChapterSchema = createComicChapterSchema.omit({ comicId: true }).partial();
export type UpdateComicChapterInput = z.infer<typeof updateComicChapterSchema>;

export const createComicImagesSchema = z.object({
  chapterId: z.string().trim().min(1),
  items: z
    .array(
      z.object({
        objectKey: z.string().trim().min(1).max(1024),
        publicUrl: urlField,
        sortOrder: z.number().int().min(0),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
      }),
    )
    .min(1)
    .max(60),
});
export type CreateComicImagesInput = z.infer<typeof createComicImagesSchema>;

export const reorderComicImagesSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        sortOrder: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(200),
});
export type ReorderComicImagesInput = z.infer<typeof reorderComicImagesSchema>;

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
