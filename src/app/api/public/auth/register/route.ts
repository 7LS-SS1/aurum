import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { viewerRegisterSchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { hashPassword, createViewerSession, setViewerSessionCookie } from "@/lib/viewer-auth";

export async function POST(req: NextRequest) {
  try {
    const { success } = await rateLimit(`viewer:register:${clientIp(req)}`, { limit: 5, windowMs: 60 * 60 * 1000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const input = viewerRegisterSchema.parse(await req.json());

    const existing = await prisma.viewer.findUnique({ where: { email: input.email } });
    if (existing) throw new ApiError("email_taken", 409);

    const viewer = await prisma.viewer.create({
      data: {
        email: input.email,
        passwordHash: await hashPassword(input.password),
        displayName: input.displayName,
      },
      select: { id: true, email: true, displayName: true },
    });

    const { token, expiresAt } = await createViewerSession(viewer.id, req);
    const res = jsonOk({ viewer }, 201);
    setViewerSessionCookie(res, token, expiresAt);
    return res;
  } catch (err) {
    return apiError(err);
  }
}
