import { describe, it, expect } from "vitest";
import {
  createMovieSchema,
  presignSchema,
  createCommentSchema,
  viewerRegisterSchema,
  assertUploadAllowed,
  assertThemeUploadAllowed,
  assertUploadAllowedAuto,
  ValidationError,
} from "./validation";

describe("createMovieSchema", () => {
  it("accepts a minimal valid payload and fills in defaults", () => {
    const result = createMovieSchema.parse({ title: "My Movie" });
    expect(result.title).toBe("My Movie");
    expect(result.categories).toEqual([]);
    expect(result.tags).toEqual([]);
    expect(result.extraMeta).toEqual({});
    expect(result.targetSiteIds).toEqual([]);
  });

  it("rejects an empty title", () => {
    expect(() => createMovieSchema.parse({ title: "" })).toThrow();
  });

  it("rejects a slug with uppercase or spaces", () => {
    expect(() => createMovieSchema.parse({ title: "x", slug: "Not Valid Slug" })).toThrow();
  });

  it("accepts a proper lowercase-hyphen slug", () => {
    const result = createMovieSchema.parse({ title: "x", slug: "my-movie-2024" });
    expect(result.slug).toBe("my-movie-2024");
  });

  it("rejects a malformed thumbnailUrl", () => {
    expect(() => createMovieSchema.parse({ title: "x", thumbnailUrl: "not-a-url" })).toThrow();
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

describe("createCommentSchema", () => {
  it("trims whitespace and rejects an empty/whitespace-only body", () => {
    expect(() => createCommentSchema.parse({ body: "   " })).toThrow();
  });

  it("rejects a body over 2000 characters", () => {
    expect(() => createCommentSchema.parse({ body: "a".repeat(2001) })).toThrow();
  });

  it("accepts a normal comment", () => {
    expect(createCommentSchema.parse({ body: "great video!" })).toEqual({ body: "great video!" });
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
