import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, apiFetch } from "./api-client";
afterEach(() => vi.unstubAllGlobals());
describe("API validation feedback", () => {
  it("preserves the review-required code and actionable message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "ยังไม่มีร่าง 14 เว็บไซต์", code: "content_review_required" }), { status: 422 })));
    await expect(apiFetch("/api/movies/m/submit-review", { method: "POST" })).rejects.toMatchObject({ status: 422, code: "content_review_required", message: "ยังไม่มีร่าง 14 เว็บไซต์" });
  });
  it("keeps every validation issue and ignores non-string error codes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ issues: [{ path: ["title"], message: "required" }, { path: ["keywords"], message: "limit" }], code: {} }), { status: 422 })));
    await expect(apiFetch("/api/movies")).rejects.toMatchObject({ message: "title: required • keywords: limit", code: undefined });
    expect(new ApiClientError("legacy", 400).status).toBe(400);
  });
  it("turns a network failure into an actionable API error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(apiFetch("/api/content-generation/jobs")).rejects.toMatchObject({
      status: 0,
      code: "network_error",
      message: "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองอีกครั้ง",
    });
  });
  it("reports an expired session when an API request is redirected to admin login", async () => {
    const response = new Response("<html>login</html>", { status: 200 });
    Object.defineProperties(response, {
      redirected: { value: true },
      url: { value: "https://aurum.example/admin/login" },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(apiFetch("/api/content-generation/jobs")).rejects.toMatchObject({
      status: 401,
      code: "session_expired",
      message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง",
    });
  });
  it("does not hide a non-JSON upstream failure behind a JSON parse error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Bad Gateway", { status: 502 })));
    await expect(apiFetch("/api/content-generation/jobs")).rejects.toMatchObject({
      status: 502,
      code: "invalid_server_response",
      message: "เซิร์ฟเวอร์ตอบกลับ HTTP 502",
    });
  });
});
