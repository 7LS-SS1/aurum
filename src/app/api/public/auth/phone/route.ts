import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { phoneAuthSchema } from "@/lib/member-validation";
import { phoneVerification, phoneVerificationReady } from "@/lib/phone-verification";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { readServicePageBody, servicePageOriginAllowed } from "@/lib/service-page-request";
import { createViewerSession, setViewerSessionCookie, hashToken } from "@/lib/viewer-auth";
export async function GET() { return jsonOk({ enabled: phoneVerificationReady() }, { headers: { "Cache-Control": "no-store" } }); }
export async function POST(req: NextRequest) {
  try {
    if (!servicePageOriginAllowed(req.headers.get("origin"), req.url)) throw new ApiError("invalid_origin", 403);
    const input = phoneAuthSchema.parse(await readServicePageBody(req));
    const checks = await Promise.all([
      rateLimit("phone:ip:" + clientIp(req), { limit: 10, windowMs: 600000 }),
      rateLimit("phone:" + input.action + ":" + hashToken(input.phone), { limit: input.action === "send" ? 3 : 5, windowMs: 600000 }),
    ]);
    if (checks.some(r => !r.success)) throw new ApiError("too_many_requests", 429);
    if (input.action === "send") {
      if (!(await rateLimit("phone:global-send", { limit: 100, windowMs: 3600000 })).success) throw new ApiError("too_many_requests", 429);
      await phoneVerification(input.phone); return jsonOk({ sent: true });
    }
    if (!input.code) throw new ApiError("invalid_code", 400);
    await phoneVerification(input.phone, input.code);
    // A verified phone identifies only a phone account; never merge by contact
    // text/email supplied with an order or by an unverified matching address.
    const viewer = await prisma.viewer.upsert({ where: { phone: input.phone }, update: {},
      create: { phone: input.phone, phoneVerifiedAt: new Date(), displayName: input.displayName || "สมาชิก" },
      select: { id: true, email: true, displayName: true } });
    const session = await createViewerSession(viewer.id, req);
    const response = jsonOk({ viewer });
    setViewerSessionCookie(response, session.token, session.expiresAt);
    return response;
  } catch (error) { return apiError(error); }
}
