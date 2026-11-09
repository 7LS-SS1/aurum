import { z } from "zod";
import { requireMinRole } from "@/lib/authz";
import { apiError, ApiError, jsonOk } from "@/lib/api-response";
import { servicePageOriginAllowed } from "@/lib/service-page-request";
import { reconcilePromptPay } from "@/lib/promptpay-orders";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("MANAGER");
    if (!servicePageOriginAllowed(request.headers.get("origin"), request.url)) throw new ApiError("invalid_origin", 403);
    const id = z.string().uuid().parse((await params).id);
    if (!(await rateLimit("promptpay-staff:" + actor.id, { limit: 12, windowMs: 60000 })).success) throw new ApiError("rate_limited", 429);
    return jsonOk(await reconcilePromptPay(id), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
