import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";
import { requireAdmin } from "@/lib/authz";
import { ApiError, apiError, jsonOk } from "@/lib/api-response";
import { readAiConfig } from "@/lib/content-ai";
import { logAudit } from "@/lib/audit";

const schema = z.object({ enabled: z.boolean(), model: z.string().trim().min(1).max(100), apiKey: z.string().trim().min(10).max(512).optional() });
export async function GET() {
  try {
    await requireAdmin();
    const config = await readAiConfig({ requireStorage: true });
    return jsonOk({ enabled: config?.enabled ?? false, model: config?.model ?? "", hasApiKey: !!config });
  } catch (error) { return apiError(error); }
}
export async function PUT(req: Request) {
  try {
    const actor = await requireAdmin();
    const input = schema.parse(await req.json());
    const previous = await readAiConfig({ requireStorage: true });
    if (!previous && !input.apiKey) throw new ApiError("กรุณากรอก OpenAI API key");
    const key = input.apiKey ? encrypt(input.apiKey) : null;
    const secret = key ? { apiKeyEnc: key.ciphertext, apiKeyIv: key.iv, apiKeyTag: key.tag } : {
      apiKeyEnc: previous!.apiKeyEnc, apiKeyIv: previous!.apiKeyIv, apiKeyTag: previous!.apiKeyTag,
    };
    await prisma.contentAiConfig.upsert({ where: { id: "default" },
      create: { id: "default", enabled: input.enabled, model: input.model, ...secret },
      update: { enabled: input.enabled, model: input.model, ...secret } });
    await logAudit({ actor, action: "content_ai.configure", resourceType: "ContentAiConfig", metadata: { enabled: input.enabled, model: input.model } });
    return jsonOk({ saved: true });
  } catch (error) { return apiError(error); }
}

/** Validate the saved account/model without generating billable content. */
export async function POST() {
  try {
    await requireAdmin();
    const config = await readAiConfig({ requireStorage: true });
    if (!config) throw new ApiError("กรุณาบันทึก API key และชื่อโมเดลก่อน");
    const apiKey = decrypt({ ciphertext: config.apiKeyEnc, iv: config.apiKeyIv, tag: config.apiKeyTag });
    let response: Response;
    try {
      response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(config.model)}`, {
        headers: { Authorization: `Bearer ${apiKey}` }, redirect: "error", signal: AbortSignal.timeout(15000), cache: "no-store",
      });
    } catch { throw new ApiError("เชื่อมต่อ OpenAI ไม่สำเร็จ กรุณาตรวจเครือข่ายแล้วลองอีกครั้ง", 502); }
    if (!response.ok) {
      const messages: Record<number, string> = {
        401: "OpenAI ไม่ยอมรับ API key นี้ กรุณาตรวจสอบคีย์แล้วบันทึกใหม่",
        403: "API key นี้ไม่มีสิทธิ์เข้าถึงโมเดลที่เลือก",
        404: "ไม่พบ model ID นี้ หรือบัญชีไม่มีสิทธิ์ใช้งาน กรุณาตรวจชื่อโมเดล เช่น gpt-4.1-mini",
        429: "OpenAI จำกัดคำขอหรือโควตาบัญชี กรุณาตรวจโควตาแล้วลองอีกครั้ง",
      };
      throw new ApiError(messages[response.status] ?? `OpenAI ตอบกลับ HTTP ${response.status} กรุณาลองอีกครั้ง`, 422);
    }
    return jsonOk({ connected: true });
  } catch (error) { return apiError(error); }
}
