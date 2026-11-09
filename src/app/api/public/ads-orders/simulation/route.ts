import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, ApiError, jsonOk } from "@/lib/api-response";
import { requireViewerFromRequest } from "@/lib/viewer-auth";
import { readSimulationOrder, simulatePayment, simulationPaymentSchema } from "@/lib/ads-orders";
import { readServicePageBody, servicePageOriginAllowed } from "@/lib/service-page-request";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  try {
    const viewer = await requireViewerFromRequest(request);
    const id = z.string().uuid().parse(request.nextUrl.searchParams.get("id"));
    return jsonOk({ order: await readSimulationOrder(id, viewer.id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try {
    if (!servicePageOriginAllowed(request.headers.get("origin"), request.url)) throw new ApiError("invalid_origin", 403);
    const viewer = await requireViewerFromRequest(request);
    if (!(await rateLimit("ads-simulation:" + viewer.id, { limit: 30, windowMs: 60000 })).success) throw new ApiError("rate_limited", 429);
    return jsonOk({ order: await simulatePayment(simulationPaymentSchema.parse(await readServicePageBody(request)), viewer.id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
