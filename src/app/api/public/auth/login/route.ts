import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { viewerLoginSchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { verifyPassword, createViewerSession, setViewerSessionCookie } from "@/lib/viewer-auth";

export async function POST(req: NextRequest) {
  try {
    const input = viewerLoginSchema.parse(await req.json());

    const [byIp, byEmail] = await Promise.all([
      rateLimit(`viewer:login:${clientIp(req)}`, { limit: 10, windowMs: 10 * 60 * 1000 }),
      rateLimit(`viewer:login:${input.email}`, { limit: 10, windowMs: 10 * 60 * 1000 }),
    ]);
    if (!byIp.success || !byEmail.success) throw new ApiError("too_many_requests", 429);

    const viewer = await prisma.viewer.findUnique({ where: { email: input.email } });
    // Generic error for both "no such email" and "wrong password" — avoid user enumeration.
    if (!viewer || !(await verifyPassword(input.password, viewer.passwordHash))) {
      throw new ApiError("invalid_credentials", 401);
    }

    const { token, expiresAt } = await createViewerSession(viewer.id, req);
    const res = jsonOk({ viewer: { id: viewer.id, email: viewer.email, displayName: viewer.displayName } });
    setViewerSessionCookie(res, token, expiresAt);
    return res;
  } catch (err) {
    return apiError(err);
  }
}
