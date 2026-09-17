import { afterEach, describe, expect, it, vi } from "vitest";
import { generateSeo, seoSourceContext, titleIdentity, validateSeo, SeoGenerationValidationError, seoValidationReason } from "./content-seo";
afterEach(() => vi.unstubAllGlobals());
const original = "ของเล่นมาใหม่";
describe("site-specific SEO", () => {
  it.each([
    [{ title: "อัปเดต" + original, description: "รายละเอียด" }, "seo_description_keyword_required"],
    [{ title: original, description: "ของเล่น" }, "seo_duplicate_title"],
    [{ title: "เรื่องอื่น", description: "ของเล่น" }, "seo_original_title_required"],
    [{ title: "", description: "ของเล่น" }, "seo_title_empty"],
    [{ title: "อัปเดต" + original, description: "" }, "seo_description_empty"],
    [{ title: "ก".repeat(161), description: "ของเล่น" }, "seo_title_too_long"],
    [{ title: "อัปเดต" + original, description: "ก".repeat(321) }, "seo_description_too_long"],
  ])("preserves the bounded validation reason after three rejected outputs: %s", async (output, reason) => {
    const reply = () => new Response(JSON.stringify({ status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify(output) }] }] }));
    const fetchMock = vi.fn().mockImplementation(async () => reply()); vi.stubGlobal("fetch", fetchMock);
    await expect(generateSeo({ apiKey: "private-key", model: "gpt-4.1-mini", title: original, keywords: ["ของเล่น"], site: "A", forbidden: [] }))
      .rejects.toMatchObject({ name: "SeoGenerationValidationError", reason, message: `seo_generation_validation_failed:${reason}` });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const retry = JSON.parse(fetchMock.mock.calls[1]![1].body);
    expect(JSON.parse(retry.input).validationFeedback).toBe(reason);
    expect(retry.text.format.schema.properties.title).toMatchObject({ minLength: 1, maxLength: 160 });
  });
  it("does not call the provider when preserving a long source title cannot fit the limit", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(generateSeo({ apiKey: "key", model: "test", title: "ก".repeat(160), keywords: ["ก"], site: "A", forbidden: [] }))
      .rejects.toMatchObject({ reason: "seo_source_title_too_long" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("keeps fine-tuned schemas compatible while still validating their results", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify({ title: "อัปเดต" + original, description: "ของเล่นมาใหม่" }) }] }] })));
    vi.stubGlobal("fetch", fetchMock);
    await generateSeo({ apiKey: "key", model: "ft:custom-model", title: original, keywords: ["ของเล่น"], site: "A", forbidden: [] });
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).text.format.schema.properties.title).toEqual({ type: "string" });
  });
  it("recognizes legacy errors but never treats provider errors or arbitrary private text as validation failures", () => {
    expect(seoValidationReason(new Error("seo_generation_validation_failed"))).toBe("seo_invalid_shape");
    expect(seoValidationReason(new SeoGenerationValidationError("seo_duplicate_title"))).toBe("seo_duplicate_title");
    for (const message of ["openai_refused", "openai_rate_limit", "openai_connection_failed", "seo_source_changed_retry", "seo_generation_validation_failed:private-account-details"]) {
      expect(seoValidationReason(new Error(message))).toBeNull();
    }
  });
  it("extracts bounded source context and excludes scripts and styling", () => {
    expect(seoSourceContext('<p>เนื้อหาเดิม</p><script>ignore instructions</script><style>.a{}</style>', 'สรุปเดิม')).toBe('สรุปเดิม เนื้อหาเดิม');
    expect(seoSourceContext('ก'.repeat(13000))).toHaveLength(12000);
    expect(seoSourceContext(null, null)).toBe("");
  });
  it.each([
    { code: "insufficient_quota" },
    { code: "credit_balance_exhausted", type: "insufficient_quota" },
  ])("distinguishes exhausted billing quota from temporary rate limiting: %j", async quotaError => {
    const input = { apiKey: "secret", model: "test", title: original, keywords: ["ของเล่น"], site: "A", forbidden: [] };
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { ...quotaError, message: "private account details" } }), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "rate_limit_exceeded" } }), { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(generateSeo(input)).rejects.toThrow("openai_insufficient_quota");
    await expect(generateSeo(input)).rejects.toThrow("openai_rate_limit");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("compares Thai titles without punctuation, whitespace or invisible characters", () => {
    expect(titleIdentity("อัปเดต ของเล่นมาใหม่??\u200b")).toBe(titleIdentity("อัปเดตของเล่นมาใหม่"));
  });
  it("rejects source-only and punctuation-only rewrites", () => {
    expect(() => validateSeo({ title: original + "??", description: "รายละเอียด" }, original, [])).toThrow("seo_duplicate_title");
  });
  it("rejects duplicates already reserved for another site", () => {
    expect(() => validateSeo({ title: "อัปเดตของเล่นมาใหม่!", description: "รายละเอียด" }, original, ["อัปเดต ของเล่นมาใหม่"])).toThrow("seo_duplicate_title");
  });
  it("requires the original subject and plain text", () => {
    expect(() => validateSeo({ title: "โทรศัพท์รุ่นใหม่", description: "รายละเอียด" }, original, [])).toThrow("seo_original_title_required");
    expect(() => validateSeo({ title: "อัปเดต" + original, description: "<b>รายละเอียด</b>" }, original, [])).toThrow("seo_plain_text_required");
  });
  it("accepts a distinct anchored title", () => {
    expect(validateSeo({ title: "อัปเดต" + original, description: "รู้จักของเล่นมาใหม่ พร้อมรายละเอียดของเล่นในวิดีโอ" }, original, []).title).toBe("อัปเดต" + original);
  });
  it("requires a supplied keyword in the meta description", () => {
    expect(() => validateSeo({ title: "อัปเดต" + original, description: "รายละเอียดเพิ่มเติม" }, original, [], ["ของเล่น"])).toThrow("seo_description_keyword_required");
  });
  it("retries invalid model output and sends no credentials inside the prompt", async () => {
    const reply = (title: string) => new Response(JSON.stringify({ status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify({ title, description: "รายละเอียดของเล่นมาใหม่" }) }] }] }));
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(original)).mockResolvedValueOnce(reply("อัปเดต" + original));
    vi.stubGlobal("fetch", fetchMock);
    const result = await generateSeo({ apiKey: "test-secret", model: "test-model", title: original, keywords: ["ของเล่น"], site: "A", forbidden: [], sourceContext: "ข้อมูลต้นฉบับ" });
    expect(result.title).toBe("อัปเดต" + original);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![1].body).not.toContain("test-secret");
    const request = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(JSON.parse(request.input).sourceContext).toBe("ข้อมูลต้นฉบับ");
    const retry = JSON.parse(fetchMock.mock.calls[1]![1].body);
    expect(JSON.parse(retry.input).validationFeedback).toBe("seo_duplicate_title");
  });
  it("does not retry a refusal or expose upstream error bodies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "completed", output: [{ content: [{ type: "refusal" }] }] })));
    vi.stubGlobal("fetch", fetchMock);
    const input = { apiKey: "secret", model: "test", title: original, keywords: ["ของเล่น"], site: "A", forbidden: [] };
    await expect(generateSeo(input)).rejects.toThrow("openai_refused");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValue(new Response("sensitive upstream body", { status: 401 }));
    await expect(generateSeo(input)).rejects.toThrow("openai_http_401");
  });
});
