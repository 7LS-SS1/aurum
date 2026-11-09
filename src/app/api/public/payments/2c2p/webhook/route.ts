import { z } from "zod";
import { apiError, jsonOk } from "@/lib/api-response";
import { readServicePageBody } from "@/lib/service-page-request";
import { handlePromptPayWebhook } from "@/lib/promptpay-orders";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const { payload } = z.object({ payload: z.string().max(100_000) }).strict().parse(await readServicePageBody(request));
    return jsonOk(await handlePromptPayWebhook(payload), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
