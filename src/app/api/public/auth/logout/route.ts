import { NextRequest } from "next/server";
import { apiError, jsonOk } from "@/lib/api-response";
import { deleteViewerSessionByToken, clearViewerSessionCookie, VIEWER_COOKIE_NAME } from "@/lib/viewer-auth";

export async function POST(req: NextRequest) {
  try {
    await deleteViewerSessionByToken(req.cookies.get(VIEWER_COOKIE_NAME)?.value);
    const res = jsonOk({ ok: true });
    clearViewerSessionCookie(res);
    return res;
  } catch (err) {
    return apiError(err);
  }
}
