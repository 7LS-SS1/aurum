import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  rateLimit: vi.fn(),
  readConfig: vi.fn(),
  decrypt: vi.fn(),
  generate: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/authz", () => ({ requireMinRole: mocks.auth }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/content-ai", () => ({ readAiConfig: mocks.readConfig }));
vi.mock("@/lib/crypto", () => ({ decrypt: mocks.decrypt }));
vi.mock("@/lib/video-content-ai", () => ({ generateVideoText: mocks.generate }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));

import { POST } from "./route";

function request() {
  return new Request("http://localhost/api/video-content/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourceTitle: "andiipoops VIP OnlyFans 2",
      currentDescription: "",
      categories: [],
      tags: [],
      actors: [],
    }),
  });
}

describe("video content generation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ id: "staff-1" });
    mocks.rateLimit.mockResolvedValue({ success: true });
    mocks.readConfig.mockResolvedValue({
      enabled: true,
      provider: "grok",
      model: "grok-4.6",
      apiKeyEnc: "ciphertext",
      apiKeyIv: "iv",
      apiKeyTag: "tag",
    });
    mocks.decrypt.mockReturnValue("secret");
    mocks.audit.mockResolvedValue(undefined);
  });

  it("returns generated drafts for editor review", async () => {
    mocks.generate.mockResolvedValue({ title: "andiipoops VIP OnlyFans 2 คลิปใหม่", description: "คำบรรยาย" });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      title: "andiipoops VIP OnlyFans 2 คลิปใหม่",
      description: "คำบรรยาย",
      provider: "Grok (xAI)",
    });
  });

  it.each([
    ["content_ai_connection_failed", 504, "AI ใช้เวลาตอบนานเกินไปหรือเชื่อมต่อไม่สำเร็จ กรุณาลองใหม่"],
    ["content_ai_invalid_response", 422, "AI ส่งชื่อหรือคำบรรยายไม่ตรงเงื่อนไข กรุณาลองใหม่"],
    ["content_ai_incomplete_response", 422, "AI สร้างข้อความไม่เสร็จ กรุณาลองใหม่"],
    ["content_ai_refused", 422, "AI ปฏิเสธการสร้างข้อความนี้ กรุณาปรับชื่อหรือข้อมูลแล้วลองใหม่"],
  ])("maps %s to a specific safe response", async (code, status, message) => {
    mocks.generate.mockRejectedValue(new Error(code));

    const response = await POST(request());

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: message });
  });
});
