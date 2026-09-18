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
});
