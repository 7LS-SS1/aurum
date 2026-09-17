import { z } from "zod";
import { requireMinRole } from "@/lib/authz";
import { ApiError, apiError, jsonOk } from "@/lib/api-response";
import { ensureSiteSeo, readAiConfig } from "@/lib/content-ai";
import { keywordsSchema, seoValidationReason, seoValidationMessage } from "@/lib/content-seo";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 180;
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("STAFF");
    if (!(await rateLimit(`generate-seo:${actor.id}`, { limit: 30, windowMs: 60_000 })).success) {
      throw new ApiError("too_many_requests", 429);
    }
    const { id } = await params;
    const input = z.object({ siteId: z.string().min(1), keywords: keywordsSchema }).parse(await req.json());
    if (!(await readAiConfig())?.enabled) throw new ApiError("กรุณาเปิดใช้งาน OpenAI ในการตั้งค่า AI");
    const draft = await ensureSiteSeo(id, input.siteId, input.keywords);
    await logAudit({ actor, action: "movie.generate_seo", resourceType: "Movie", resourceId: id, metadata: { siteId: input.siteId } });
    return jsonOk(draft);
  } catch (error) {
    const validationReason = seoValidationReason(error);
    if (validationReason) return apiError(new ApiError(seoValidationMessage(validationReason), 422));
    if (error instanceof Error && error.message === "openai_insufficient_quota") {
      return apiError(new ApiError("โควตา OpenAI ไม่เพียงพอ กรุณาตรวจเครดิตและวงเงินของ API project ที่ใช้คีย์นี้ แล้วลองสร้างใหม่", 422));
    }
    if (error instanceof Error && error.message === "openai_rate_limit") {
      return apiError(new ApiError("OpenAI จำกัดจำนวนคำขอชั่วคราว กรุณารอสักครู่แล้วลองใหม่", 429));
    }
    if (error instanceof Error && error.message === "openai_http_429") {
      return apiError(new ApiError("OpenAI ตอบ 429 กรุณาตรวจโควตาและวงเงิน API หรือรอสักครู่แล้วลองใหม่", 429));
    }
    if (error instanceof Error && /^(openai_|seo_|site_inactive)/.test(error.message)) return apiError(new ApiError(error.message, 422));
    return apiError(error);
  }
}
