import { readServicePageBody, servicePageOriginAllowed } from "@/lib/service-page-request";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { viewerRegisterSchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { hashPassword, createViewerSession, setViewerSessionCookie } from "@/lib/viewer-auth";

export async function POST(req: NextRequest) {
  try {
    if (!servicePageOriginAllowed(req.headers.get("origin"), req.url)) throw new ApiError("invalid_origin", 403);
    const { success } = await rateLimit(`viewer:register:${clientIp(req)}`, { limit: 5, windowMs: 60 * 60 * 1000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const input = viewerRegisterSchema.parse(await readServicePageBody(req));
    if (new TextEncoder().encode(input.password).length > 72) throw new ApiError("password_too_long", 422);

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
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return apiError(new ApiError("email_taken", 409));
    return apiError(err);
  }
}
