import { describe, expect, it } from "vitest";
import { validateVideoText } from "./video-content-ai";

describe("validateVideoText", () => {
  const sourceTitle = "ZMAR-159 Maria Nagai";
  it("accepts grounded plain text", () => {
    expect(validateVideoText({ title: "รับชม ZMAR-159 Maria Nagai", description: "ข้อมูลวิดีโอ ZMAR-159 Maria Nagai" }, sourceTitle)).toMatchObject({ title: "รับชม ZMAR-159 Maria Nagai" });
  });
  it("rejects changed identity and markup", () => {
    expect(() => validateVideoText({ title: "เรื่องอื่น", description: "คำอธิบาย" }, sourceTitle)).toThrow("video_text_source_title_required");
    expect(() => validateVideoText({ title: "ZMAR-159 Maria Nagai", description: "<b>คำอธิบาย</b>" }, sourceTitle)).toThrow("video_text_plain_text_required");
  });
});
