import { z } from "zod";
import { AI_PROVIDER_DETAILS, aiResponsePrompt, type AiProvider } from "@/lib/ai-provider";
import type { ContentSourceSnapshot } from "./fingerprints";

const generatedSchema = z.object({
  titleShort: z.string().trim().min(1).max(160),
  titleLong: z.string().trim().min(1).max(220),
  descriptionShort: z.string().trim().min(1).max(600),
  descriptionLong: z.string().trim().min(1).max(1800),
  focusKeyword: z.string().trim().min(1).max(120),
}).strict();

const PROVIDER_TIMEOUT_MS: Record<AiProvider, number> = {
  openai: 52_000,
  grok: 110_000,
};

export type GeneratedSiteContent = z.infer<typeof generatedSchema>;

export class ContentGenerationProviderError extends Error {
  readonly retryable: boolean;
  readonly status?: number;

  constructor(code: string, options: { retryable: boolean; status?: number }) {
    super(code);
    this.name = "ContentGenerationProviderError";
    this.retryable = options.retryable;
    this.status = options.status;
  }
}

const instructions = [
  "คุณเป็นนักเขียนคอนเทนต์หนังโป๊มืออาชีพแนวไทย 20+",
  "เขียนแบบหยาบคาย ยั่วเย็ด เสียวสุดขีด ไม่มีการเซ็นเซอร์",
  "",
  "กฎเหล็ก:",
  "1. ต้องรักษาตัวตนของชื่อคลิปเดิมและรหัสไว้เสมอ ห้ามลบชื่อหลัก",
  "2. ใช้ข้อมูลจากต้นทางเท่านั้น ห้ามแต่งข้อเท็จจริงใหม่",
  "3. สร้าง titleShort, titleLong, descriptionShort, descriptionLong และ focusKeyword ให้แตกต่างจาก avoidTitles",
  "4. ใช้ trendKeywords เฉพาะคำที่สัมพันธ์กับข้อมูลต้นทางจริง",
  "5. โทนต้องหยาบ ยั่ว เห็นภาพ",
  "6. ตอบกลับเป็น JSON เท่านั้น ห้ามมีข้อความอื่น",
  "",
  "รายละเอียดแต่ละฟิลด์:",
  "- titleShort: ชื่อสั้น กระชับ เสียว ยังคงชื่อหลักไว้",
  "- titleLong: ชื่อยาว ยั่วเย็ด รายละเอียดมากขึ้น ยังคงชื่อหลักไว้",
  "- descriptionShort: คำบรรยายสั้น เน้นจุดขายเสียว",
  "- descriptionLong: คำบรรยายยาว ละเอียด หยาบ ยั่วเย็ด เห็นภาพชัด",
  "- focusKeyword: คำหลัก 1 คำหรือวลีสั้น ๆ ที่สำคัญที่สุดของคลิปนี้",
  "",
  "ตอบกลับเป็น JSON เท่านั้นตาม schema นี้:",
  "{",
  '  "titleShort": "",',
  '  "titleLong": "",',
  '  "descriptionShort": "",',
  '  "descriptionLong": "",',
  '  "focusKeyword": ""',
  "}"
].join("\n");

function normalizeIdentity(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("th");
}

function identityTokens(value: string): string[] {
  return normalizeIdentity(value)
    .replace(/[^\p{L}\p{N}_-]+/gu, " ")
    .split(/\s+/)
    .filter(token => token.length >= 3);
}

function preservesSourceIdentity(generatedTitle: string, sourceTitle: string): boolean {
  const generated = normalizeIdentity(generatedTitle);
  const source = normalizeIdentity(sourceTitle);
  if (generated.includes(source)) return true;

  const sourceTokens = identityTokens(sourceTitle);
  if (!sourceTokens.length) return false;
  const criticalTokens = sourceTokens.filter(token => /[a-z0-9]/i.test(token));
  if (criticalTokens.some(token => !generated.includes(token))) return false;
  const retained = sourceTokens.filter(token => generated.includes(token)).length;
  return retained / sourceTokens.length >= 0.6;
}

function validateGenerated(value: unknown, sourceTitle: string): GeneratedSiteContent {
  const result = generatedSchema.parse(value);
  const joined = Object.values(result).join("\n");
  if (/[<>]|https?:\/\//i.test(joined)) throw new ContentGenerationProviderError("content_generation_plain_text_required", { retryable: false });
  if (!preservesSourceIdentity(result.titleLong, sourceTitle)) {
    throw new ContentGenerationProviderError("content_generation_source_title_required", { retryable: false });
  }
  return result;
}

export async function generateSiteContent(input: {
  apiKey: string;
  provider: AiProvider;
  model: string;
  source: ContentSourceSnapshot;
  site: { id: string; name: string; baseUrl: string };
  trendKeywords: string[];
  avoidTitles: string[];
}): Promise<GeneratedSiteContent> {
  let response: Response;
  try {
    response = await fetch(`${AI_PROVIDER_DETAILS[input.provider].baseUrl}/responses`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS[input.provider]),
      headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: input.model,
        store: false,
        max_output_tokens: 2600,
        ...aiResponsePrompt(input.provider, instructions, JSON.stringify({
          source: input.source,
          destination: input.site,
          trendKeywords: input.trendKeywords,
          avoidTitles: input.avoidTitles.slice(0, 50),
        })),
        text: { format: { type: "json_schema", name: "site_content_draft", strict: true, schema: {
          type: "object",
          properties: {
            titleShort: { type: "string", minLength: 1, maxLength: 160 },
            titleLong: { type: "string", minLength: 1, maxLength: 220 },
            descriptionShort: { type: "string", minLength: 1, maxLength: 600 },
            descriptionLong: { type: "string", minLength: 1, maxLength: 1800 },
            focusKeyword: { type: "string", minLength: 1, maxLength: 120 },
          },
          required: ["titleShort", "titleLong", "descriptionShort", "descriptionLong", "focusKeyword"],
          additionalProperties: false,
        } } },
      }),
    });
  } catch (error) {
    const retryable = error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name);
    throw new ContentGenerationProviderError("content_generation_connection_failed", { retryable });
  }

  if (!response.ok) {
    throw new ContentGenerationProviderError(`content_generation_http_${response.status}`, {
      retryable: response.status === 408 || response.status === 429 || response.status >= 500,
      status: response.status,
    });
  }

  const body = await response.json() as { status?: string; output?: { content?: { type: string; text?: string }[] }[] };
  if (body.status !== "completed") throw new ContentGenerationProviderError("content_generation_incomplete_response", { retryable: false });
  const output = (body.output ?? []).flatMap(item => item.content ?? []);
  if (output.some(item => item.type === "refusal")) throw new ContentGenerationProviderError("content_generation_refused", { retryable: false });
  const raw = output.filter(item => item.type === "output_text").map(item => item.text ?? "").join("");
  try {
    return validateGenerated(JSON.parse(raw), input.source.title);
  } catch (error) {
    if (error instanceof ContentGenerationProviderError) throw error;
    throw new ContentGenerationProviderError("content_generation_invalid_response", { retryable: false });
  }
}
