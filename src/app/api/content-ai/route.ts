import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";
import { requireAdmin } from "@/lib/authz";
import { ApiError, apiError, jsonOk } from "@/lib/api-response";
import { readAiConfig } from "@/lib/content-ai";
import { logAudit } from "@/lib/audit";
import { aiProvider, AI_PROVIDERS, AI_PROVIDER_DETAILS } from "@/lib/ai-provider";

const schema = z.object({ provider: z.enum(AI_PROVIDERS).optional(), enabled: z.boolean(), model: z.string().trim().min(1).max(100), apiKey: z.string().trim().min(10).max(512).optional() });
export async function GET() {
  try {
    await requireAdmin();
    const config = await readAiConfig({ requireStorage: true });
    const provider = aiProvider(config?.provider);
    const profiles = Object.fromEntries(await Promise.all(AI_PROVIDERS.map(async name => {
      const saved = config && provider === name ? config : await readAiConfig({ requireStorage: true, provider: name });
      return [name, { model: saved?.model ?? "", hasApiKey: !!saved }];
    })));
    return jsonOk({ provider, enabled: config?.enabled ?? false, model: config?.model ?? "", hasApiKey: !!config, profiles });
  } catch (error) { return apiError(error); }
}
export async function PUT(req: Request) {
  try {
    const actor = await requireAdmin();
    const input = schema.parse(await req.json());
    await readAiConfig({ requireStorage: true });
    const key = input.apiKey ? encrypt(input.apiKey) : null;
    const provider = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"content-ai-config"}))`;
      const previous = await tx.contentAiConfig.findUnique({ where: { id: "default" } });
      const previousProvider = aiProvider(previous?.provider);
      const selected = input.provider ?? previousProvider;
      const saved = previous && previousProvider === selected ? previous : await tx.contentAiConfig.findUnique({ where: { id: `provider:${selected}` } });
      if (!key && !saved) throw new ApiError(`กรุณากรอก ${AI_PROVIDER_DETAILS[selected].label} API key`, 422);
      const secret = key ? { apiKeyEnc: key.ciphertext, apiKeyIv: key.iv, apiKeyTag: key.tag } : {
        apiKeyEnc: saved!.apiKeyEnc, apiKeyIv: saved!.apiKeyIv, apiKeyTag: saved!.apiKeyTag,
      };
      if (previous && previousProvider !== selected) {
        const data = { provider: previousProvider, enabled: previous.enabled, model: previous.model, apiKeyEnc: previous.apiKeyEnc, apiKeyIv: previous.apiKeyIv, apiKeyTag: previous.apiKeyTag };
        await tx.contentAiConfig.upsert({ where: { id: `provider:${previousProvider}` }, create: { id: `provider:${previousProvider}`, ...data }, update: data });
      }
      const data = { provider: selected, enabled: input.enabled, model: input.model, ...secret };
      for (const id of [`provider:${selected}`, "default"]) await tx.contentAiConfig.upsert({ where: { id }, create: { id, ...data }, update: data });
      return selected;
    });
    await logAudit({ actor, action: "content_ai.configure", resourceType: "ContentAiConfig", metadata: { provider, enabled: input.enabled, model: input.model } });
    return jsonOk({ saved: true });
  } catch (error) { return apiError(error); }
}

/** Validate the saved account/model without generating billable content. */
export async function POST() {
  try {
    await requireAdmin();
    const config = await readAiConfig({ requireStorage: true });
    if (!config) throw new ApiError("กรุณาบันทึก API key และชื่อโมเดลก่อน");
    const provider = aiProvider(config.provider);
    const details = AI_PROVIDER_DETAILS[provider];
    const apiKey = decrypt({ ciphertext: config.apiKeyEnc, iv: config.apiKeyIv, tag: config.apiKeyTag });
    let response: Response;
    try {
      response = await fetch(`${details.baseUrl}/models/${encodeURIComponent(config.model)}`, {
        headers: { Authorization: `Bearer ${apiKey}` }, redirect: "error", signal: AbortSignal.timeout(15000), cache: "no-store",
      });
    } catch { throw new ApiError(`เชื่อมต่อ ${details.label} ไม่สำเร็จ กรุณาตรวจเครือข่ายแล้วลองอีกครั้ง`, 502); }
    if (!response.ok) {
      const messages: Record<number, string> = {
        401: `${details.label} ไม่ยอมรับ API key นี้ กรุณาตรวจสอบคีย์แล้วบันทึกใหม่`,
        403: "API key นี้ไม่มีสิทธิ์เข้าถึงโมเดลที่เลือก",
        404: `ไม่พบ model ID นี้ หรือบัญชีไม่มีสิทธิ์ใช้งาน กรุณาตรวจชื่อโมเดล เช่น ${details.modelExample}`,
        429: `${details.label} จำกัดคำขอหรือโควตาบัญชี กรุณาตรวจโควตาแล้วลองอีกครั้ง`,
      };
      throw new ApiError(messages[response.status] ?? `${details.label} ตอบกลับ HTTP ${response.status} กรุณาลองอีกครั้ง`, 422);
    }
    return jsonOk({ connected: true });
  } catch (error) { return apiError(error); }
}
