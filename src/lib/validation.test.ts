import { describe, it, expect } from "vitest";
import {
  createMovieSchema,
  presignSchema,
  viewerRegisterSchema,
  assertUploadAllowed,
  assertThemeUploadAllowed,
  assertUploadAllowedAuto,
  ValidationError,
  syncJobsBatchSchema,
  jobLogsQuerySchema,
} from "./validation";

describe("createMovieSchema", () => {
  it("accepts a minimal valid payload and fills in defaults", () => {
    const result = createMovieSchema.parse({ title: "My Movie", mainCategory: "AV" });
    expect(result.title).toBe("My Movie");
    expect(result.categories).toEqual([]);
    expect(result.tags).toEqual([]);
    expect(result.extraMeta).toEqual({});
    expect(result.targetSiteIds).toEqual([]);
  });

  it("rejects an empty title", () => {
    expect(() => createMovieSchema.parse({ title: "", mainCategory: "AV" })).toThrow();
  });

  it("rejects a missing mainCategory", () => {
    expect(() => createMovieSchema.parse({ title: "x" })).toThrow();
  });

  it("normalizes a manually entered slug with spaces and punctuation", () => {
    const result = createMovieSchema.parse({ title: "x", mainCategory: "AV", slug: "Not Valid_Slug.mp4" });
    expect(result.slug).toBe("not-valid-slug-mp4");
  });

  it("accepts a proper lowercase-hyphen slug", () => {
    const result = createMovieSchema.parse({ title: "x", mainCategory: "AV", slug: "my-movie-2024" });
    expect(result.slug).toBe("my-movie-2024");
  });

  it("preserves Thai letters while normalizing a pasted filename", () => {
    const result = createMovieSchema.parse({ title: "x", mainCategory: "AV", slug: "คลิป พิเศษ_01.mp4" });
    expect(result.slug).toBe("คลิป-พิเศษ-01-mp4");
  });

  it("rejects a malformed thumbnailUrl", () => {
    expect(() => createMovieSchema.parse({ title: "x", mainCategory: "AV", thumbnailUrl: "not-a-url" })).toThrow();
  });
});

describe("presignSchema", () => {
  it("rejects a filename containing a path separator (traversal guard)", () => {
    expect(() =>
      presignSchema.parse({ provider: "r2", filename: "../../etc/passwd", contentType: "image/png" }),
    ).toThrow();
  });

  it("accepts a normal filename", () => {
    const result = presignSchema.parse({ provider: "r2", filename: "thumb.png", contentType: "image/png" });
    expect(result.filename).toBe("thumb.png");
  });

  it("rejects a size above the 10 GB ceiling", () => {
    expect(() =>
      presignSchema.parse({ provider: "bunny", filename: "v.mp4", contentType: "video/mp4", size: 11 * 1024 * 1024 * 1024 }),
    ).toThrow();
  });
});

describe("viewerRegisterSchema", () => {
  it("lowercases the email", () => {
    const result = viewerRegisterSchema.parse({ email: "Foo@Example.com", password: "password123", displayName: "Foo" });
    expect(result.email).toBe("foo@example.com");
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(() =>
      viewerRegisterSchema.parse({ email: "a@b.com", password: "short", displayName: "Foo" }),
    ).toThrow();
  });
});

describe("assertUploadAllowed", () => {
  it("throws ValidationError for an unsupported image content-type", () => {
    expect(() => assertUploadAllowed("image", "image/gif")).toThrow(ValidationError);
  });

  it("allows a supported image type under the size limit", () => {
    expect(() => assertUploadAllowed("image", "image/png", 1024)).not.toThrow();
  });

  it("throws when an image exceeds the 15 MB ceiling", () => {
    expect(() => assertUploadAllowed("image", "image/png", 16 * 1024 * 1024)).toThrow(ValidationError);
  });

  it("allows a supported video type under its own, much larger, ceiling", () => {
    expect(() => assertUploadAllowed("video", "video/mp4", 1024 * 1024 * 1024)).not.toThrow();
  });
});

describe("assertThemeUploadAllowed", () => {
  it("rejects a package whose filename doesn't end in .zip", () => {
    expect(() => assertThemeUploadAllowed("package", "theme.rar", "application/zip")).toThrow(ValidationError);
  });

  it("accepts a .zip package with an allowed content-type", () => {
    expect(() => assertThemeUploadAllowed("package", "theme.zip", "application/zip")).not.toThrow();
  });

  it("delegates to the image checks for a screenshot", () => {
    expect(() => assertThemeUploadAllowed("screenshot", "shot.png", "image/png")).not.toThrow();
    expect(() => assertThemeUploadAllowed("screenshot", "shot.gif", "image/gif")).toThrow(ValidationError);
  });
});

describe("assertUploadAllowedAuto", () => {
  it("infers 'image' for an image content-type", () => {
    expect(assertUploadAllowedAuto("image/webp")).toBe("image");
  });

  it("infers 'video' for a video content-type", () => {
    expect(assertUploadAllowedAuto("video/mp4")).toBe("video");
  });

  it("throws for a content-type that is neither", () => {
    expect(() => assertUploadAllowedAuto("application/pdf")).toThrow(ValidationError);
  });
});

describe("syncJobsBatchSchema", () => {
  it("accepts a list of site ids", () => {
    const result = syncJobsBatchSchema.parse({ siteIds: ["s1", "s2"] });
    expect(result.siteIds).toEqual(["s1", "s2"]);
  });

  it("rejects an empty list — must select at least one site", () => {
    expect(() => syncJobsBatchSchema.parse({ siteIds: [] })).toThrow();
  });

  it("rejects more than 50 site ids in a single request", () => {
    const siteIds = Array.from({ length: 51 }, (_, i) => `s${i}`);
    expect(() => syncJobsBatchSchema.parse({ siteIds })).toThrow();
  });
});

describe("jobLogsQuerySchema", () => {
  it("accepts an omitted afterId/limit (both optional)", () => {
    const result = jobLogsQuerySchema.parse({});
    expect(result).toEqual({});
  });

  it("coerces a string limit query param into a number", () => {
    const result = jobLogsQuerySchema.parse({ limit: "25" });
    expect(result.limit).toBe(25);
  });

  it("rejects a limit above the 200-row page cap", () => {
    expect(() => jobLogsQuerySchema.parse({ limit: "500" })).toThrow();
  });
});
