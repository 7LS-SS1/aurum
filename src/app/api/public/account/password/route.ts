import { NextRequest } from "next/server";
import { ApiError, apiError, jsonOk } from "@/lib/api-response";
import { changePasswordInput, changeViewerPassword } from "@/lib/account-password";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { readServicePageBody, servicePageOriginAllowed } from "@/lib/service-page-request";
import { requireViewerFromRequest, setViewerSessionCookie, VIEWER_COOKIE_NAME } from "@/lib/viewer-auth";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest) {
  try {
    if (!servicePageOriginAllowed(req.headers.get("origin"), req.url)) throw new ApiError("invalid_origin", 403);
    const viewer = await requireViewerFromRequest(req);
    const token = req.cookies.get(VIEWER_COOKIE_NAME)?.value;
    if (!token) throw new ApiError("unauthorized", 401);
    const input = changePasswordInput.parse(await readServicePageBody(req));

    const windowMs = 10 * 60_000;
    const [account, ip] = await Promise.all([
      rateLimit(`viewer:change-password:account:${viewer.id}`, { limit: 5, windowMs }),
      rateLimit(`viewer:change-password:ip:${clientIp(req)}`, { limit: 30, windowMs }),
    ]);
    if (!account.success || !ip.success) throw new ApiError("too_many_requests", 429);

    const session = await changeViewerPassword(viewer.id, token, input);
    const response = jsonOk({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
    setViewerSessionCookie(response, session.token, session.expiresAt);
    return response;
  } catch (error) { return apiError(error); }
}
