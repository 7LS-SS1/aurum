import { servicePageOriginAllowed } from "@/lib/service-page-request";
import { NextRequest } from "next/server";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { deleteViewerSessionByToken, clearViewerSessionCookie, VIEWER_COOKIE_NAME } from "@/lib/viewer-auth";

export async function POST(req: NextRequest) {
  try {
    if (!servicePageOriginAllowed(req.headers.get("origin"), req.url)) throw new ApiError("invalid_origin", 403);
    await deleteViewerSessionByToken(req.cookies.get(VIEWER_COOKIE_NAME)?.value);
    const res = jsonOk({ ok: true });
    clearViewerSessionCookie(res);
    return res;
  } catch (err) {
    return apiError(err);
  }
}
