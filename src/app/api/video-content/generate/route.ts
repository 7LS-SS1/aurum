import { z } from "zod";
import { requireMinRole } from "@/lib/authz";
import { ApiError, apiError, jsonOk } from "@/lib/api-response";
import { decrypt } from "@/lib/crypto";
import { readAiConfig } from "@/lib/content-ai";
import { aiProvider, AI_PROVIDER_DETAILS } from "@/lib/ai-provider";
import { generateVideoText } from "@/lib/video-content-ai";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

const words = z.array(z.string().trim().min(1).max(100)).max(20).default([]);
const schema = z.object({
  sourceTitle: z.string().trim().min(1).max(160), currentDescription: z.string().trim().max(1800).optional(),
  categories: words, tags: words, actors: words,
});

export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    const actor = await requireMinRole("STAFF");
    if (!(await rateLimit(`video-content-generate:${actor.id}`, { limit: 10, windowMs: 60_000 })).success) throw new ApiError("too_many_requests", 429);
    const input = schema.parse(await req.json());
    const config = await readAiConfig({ requireStorage: true });
    if (!config?.enabled) throw new ApiError("กรุณาเปิดใช้งาน AI ในหน้า ตั้งค่า AI / SEO ก่อน", 422);
    const provider = aiProvider(config.provider);
    const result = await generateVideoText({
      apiKey: decrypt({ ciphertext: config.apiKeyEnc, iv: config.apiKeyIv, tag: config.apiKeyTag }),
      provider, model: config.model, ...input,
    });
    await logAudit({ actor, action: "video.generate_editor_text", resourceType: "VideoDraft", metadata: { provider } });
    return jsonOk({ ...result, provider: AI_PROVIDER_DETAILS[provider].label });
  } catch (error) {
    if (error instanceof Error && error.message === "content_ai_http_401") return apiError(new ApiError("AI ไม่ยอมรับ API key ที่บันทึกไว้ กรุณาตรวจในการตั้งค่า AI / SEO", 422));
    if (error instanceof Error && error.message === "content_ai_http_429") return apiError(new ApiError("AI จำกัดคำขอหรือโควตาชั่วคราว กรุณาลองใหม่ภายหลัง", 429));
    if (error instanceof Error && error.message.startsWith("content_ai_")) return apiError(new ApiError("AI สร้างข้อความที่ใช้ไม่ได้หรือเชื่อมต่อไม่สำเร็จ กรุณาลองใหม่", 422));
    return apiError(error);
  }
}
