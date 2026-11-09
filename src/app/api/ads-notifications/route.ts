import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, ApiError, jsonOk } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { listNotifications, notificationKinds, updateNotification } from "@/lib/ads-notifications";
import { readServicePageBody, servicePageOriginAllowed } from "@/lib/service-page-request";
export async function GET(request: NextRequest) {
  try {
    await requireMinRole("MANAGER");
    const query = z.object({ status: z.enum(["OPEN", "RESOLVED"]).optional(), kind: z.enum(notificationKinds).optional(), orderId: z.string().uuid().optional(), source: z.literal("CUSTOMER").optional(), cursor: z.string().uuid().optional(), summary: z.enum(["true", "false"]).optional() }).parse(Object.fromEntries(request.nextUrl.searchParams));
    return jsonOk(await listNotifications({ ...query, summary: query.summary === "true" }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireMinRole("MANAGER");
    if (!servicePageOriginAllowed(request.headers.get("origin"), request.url)) throw new ApiError("invalid_origin", 403);
    const input = z.object({ id: z.string().uuid(), action: z.enum(["read", "resolve"]), response: z.string().trim().max(2000).default("") }).strict().parse(await readServicePageBody(request));
    await updateNotification(input.id, input.action, input.response, actor);
    return jsonOk({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
