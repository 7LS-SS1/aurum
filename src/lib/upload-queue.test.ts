import { describe, expect, it } from "vitest";
import { failurePhaseLabel, formatUploadError, resolveUploadContentType, retryActionLabel, validateUploadQueueItem } from "./upload-queue";

describe("resolveUploadContentType", () => {
  it("keeps a browser-provided MIME type", () => {
    expect(resolveUploadContentType({ name: "clip.mkv", type: "video/custom" })).toBe("video/custom");
  });

  it.each([
    ["clip.mkv", "video/x-matroska"],
    ["clip.ts", "video/mp2t"],
    ["clip.MP4", "video/mp4"],
    ["poster.jpg", "image/jpeg"],
  ])("infers %s when File.type is empty", (name, expected) => {
    expect(resolveUploadContentType({ name, type: "" })).toBe(expected);
  });

  it("uses an explicit unsupported type for unknown extensions", () => {
    expect(resolveUploadContentType({ name: "clip.avi", type: "" })).toBe("application/octet-stream");
  });
});

describe("validateUploadQueueItem", () => {
  const valid = {
    status: "ready",
    videoUrl: "https://video.example/playlist.m3u8",
    title: "Clip",
    thumbnailUrl: "https://images.example/poster.jpg",
    thumbProgress: null,
    previewProgress: null,
  };

  it("accepts a complete queue item", () => {
    expect(validateUploadQueueItem(valid)).toEqual([]);
  });

  it("returns every actionable issue instead of stopping at the first", () => {
    expect(
      validateUploadQueueItem({
        ...valid,
        status: "uploading",
        videoUrl: "",
        title: " ",
        thumbnailUrl: "",
        thumbProgress: 25,
        previewProgress: 50,
        previewError: "อัปโหลดพรีวิวล้มเหลว",
      }),
    ).toEqual([
      "วิดีโอหลักยังอัปโหลดไม่เสร็จ",
      "ยังไม่ได้กรอกชื่อเรื่อง",
      "รูปหน้าปกยังอัปโหลดไม่เสร็จ",
      "ยังไม่ได้อัปโหลดรูปหน้าปก",
      "วิดีโอพรีวิวยังอัปโหลดไม่เสร็จ",
      "อัปโหลดพรีวิวล้มเหลว",
    ]);
  });
});

describe("upload failure copy", () => {
  it("includes phase-specific retry labels", () => {
    expect(failurePhaseLabel("publish")).toBe("เผยแพร่");
    expect(retryActionLabel("upload")).toBe("ลองอัปโหลดใหม่");
  });

  it("includes HTTP status and a friendly message", () => {
    const error = Object.assign(new Error("too_many_requests"), { status: 429 });
    expect(formatUploadError(error, "บันทึกไม่สำเร็จ")).toContain("HTTP 429");
    expect(formatUploadError(error, "บันทึกไม่สำเร็จ")).toContain("มีคำขอมากเกินไป");
  });
});
