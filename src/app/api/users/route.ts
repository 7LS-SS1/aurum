import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createUserSchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

const MANAGEABLE_ROLES = ["STAFF", "SENIOR", "MANAGER"] as const;

const USER_PUBLIC_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET() {
  try {
    await requireRole("HEAD");
    const users = await prisma.user.findMany({
      where: { role: { in: [...MANAGEABLE_ROLES] } },
      select: USER_PUBLIC_SELECT,
      orderBy: [{ role: "desc" }, { email: "asc" }],
    });
    return jsonOk(users);
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireRole("HEAD");
    const { success } = await rateLimit(`users:create:${actor.id}`, { limit: 20, windowMs: 60_000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const input = createUserSchema.parse(await req.json());
    const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (existing) throw new ApiError("email_already_exists", 409);

    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash: await bcrypt.hash(input.password, 12),
        name: input.name,
        role: input.role,
      },
      select: USER_PUBLIC_SELECT,
    });

    await logAudit({
      actor,
      action: "create_user",
      resourceType: "user",
      resourceId: user.id,
      metadata: { email: user.email, role: user.role },
    });

    return jsonOk(user, 201);
  } catch (err) {
    return apiError(err);
  }
}
