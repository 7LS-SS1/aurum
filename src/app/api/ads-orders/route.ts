import { simulationEnabled } from "@/lib/ads-simulation-server";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireMinRole } from "@/lib/authz";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { actionSchema, actOnOrder, listOrders, paymentReady } from "@/lib/ads-orders";
import { readServicePageBody, servicePageOriginAllowed } from "@/lib/service-page-request";
import { isOrderGroup } from "@/lib/ads-order-groups";
export async function GET(request: NextRequest) {
  try { await requireMinRole("MANAGER"); const group=request.nextUrl.searchParams.get("group")||"all"; if(!isOrderGroup(group))throw new ApiError("invalid_group",422); const query=z.string().trim().max(100).parse(request.nextUrl.searchParams.get("q")||""); const cursor = request.nextUrl.searchParams.get("cursor"); if (cursor) z.string().uuid().parse(cursor); return jsonOk({ ...await listOrders(cursor || undefined, group, query), paymentReady: paymentReady(), simulationEnabled: simulationEnabled() }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return apiError(error); }
}
export async function PUT(request: NextRequest) {
  try {
    const actor = await requireMinRole("MANAGER");
    if (!servicePageOriginAllowed(request.headers.get("origin"), request.url)) throw new ApiError("invalid_origin", 403);
    const { id, ...action } = actionSchema.extend({ id: z.string().uuid() }).parse(await readServicePageBody(request));
    return jsonOk(await actOnOrder(id, action, actor));
  } catch (error) { return apiError(error); }
}
