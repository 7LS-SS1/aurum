import { afterEach, describe, expect, it, vi } from "vitest";
import { ContentGenerationProviderError, generateSiteContent } from "./provider";

const input = {
  apiKey: "secret",
  provider: "grok" as const,
  model: "grok-4.6",
  source: { title: "ABC-123 Actor", description: "ข้อมูลต้นทาง", categories: ["AV"], tags: ["HD"], actors: ["Actor"] },
  site: { id: "site-1", name: "Site", baseUrl: "https://example.com" },
  trendKeywords: ["มาแรง"],
  avoidTitles: ["ABC-123 Actor ชื่อเดิม"],
};

describe("batch content provider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns all generated variants and keeps source data in the user payload", async () => {
    const output = {
      titleShort: "ABC-123 Actor คลิปใหม่",
      titleLong: "ABC-123 Actor ผลงานมาแรงที่น่าติดตาม",
      descriptionShort: "คำบรรยายสั้น",
      descriptionLong: "คำบรรยายฉบับยาว",
      focusKeyword: "ABC-123",
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify(output) }] }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateSiteContent(input)).resolves.toEqual(output);
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const sentInstructions = request.input[0].content as string;
    expect(sentInstructions).not.toContain(input.source.title);
    expect(sentInstructions).toContain("กฎเหล็ก:");
    expect(sentInstructions).toContain("หี, ควย, เย็ด, แตกใน, น้ำเงี่ยน, คราง, ซอย, อม, เลีย");
    expect(sentInstructions).toContain("titleShort คือชื่อสั้น");
    expect(sentInstructions).toContain("descriptionLong คือคำบรรยายยาว 3-5 ประโยค");
    expect(sentInstructions).toContain("focusKeyword คือคำหลัก 1 คำหรือวลีสั้น ๆ");
    expect(JSON.parse(request.input[1].content)).toMatchObject({ source: input.source, trendKeywords: ["มาแรง"] });
  });

  it("accepts an abbreviated short title when the complete source title exceeds its 160 character limit", async () => {
    const longSourceTitle = `PRED-880 ${"ก".repeat(150)} Suzu Otonashi`;
    const output = {
      titleShort: "PRED-880 Suzu Otonashi คลิปใหม่",
      titleLong: `${longSourceTitle} ฉบับมาแรง`,
      descriptionShort: "คำบรรยายสั้น",
      descriptionLong: "คำบรรยายฉบับยาว",
      focusKeyword: "PRED-880",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify(output) }] }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await expect(generateSiteContent({ ...input, source: { ...input.source, title: longSourceTitle } })).resolves.toEqual(output);
  });

  it("accepts minor spelling changes while preserving clip codes and source identity", async () => {
    const sourceTitle = "PRED-880 คลิปหลุด mlive nornor น้องนอนอ โชวน์จุกหุ่นดีมาก Suzu Otonashi";
    const output = {
      titleShort: "PRED-880 น้องนอนอคลิปใหม่",
      titleLong: "PRED-880 คลิปหลุด mlive nornor น้องนอนอ โชว์จุกหุ่นดีมาก Suzu Otonashi ฉบับมาแรง",
      descriptionShort: "คำบรรยายสั้น",
      descriptionLong: "คำบรรยายฉบับยาว",
      focusKeyword: "PRED-880",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify(output) }] }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await expect(generateSiteContent({ ...input, source: { ...input.source, title: sourceTitle } })).resolves.toEqual(output);
  });

  it.each([[429, true], [500, true], [400, false]])("classifies HTTP %s retryability", async (status, retryable) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status })));
    const promise = generateSiteContent(input);
    await expect(promise).rejects.toBeInstanceOf(ContentGenerationProviderError);
    await promise.catch(error => expect((error as ContentGenerationProviderError).retryable).toBe(retryable));
  });
});
