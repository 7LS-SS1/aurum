import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { updateUserSchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

const MANAGEABLE_ROLES = ["STAFF", "SENIOR", "MANAGER"] as const;

const USER_PUBLIC_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function getManageableUser(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: USER_PUBLIC_SELECT,
  });
  if (!user) throw new ApiError("user_not_found", 404);
  if (!MANAGEABLE_ROLES.includes(user.role as (typeof MANAGEABLE_ROLES)[number])) {
    throw new ApiError("cannot_manage_this_role", 403);
  }
  return user;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole("HEAD");
    const { id } = await params;
    const input = updateUserSchema.parse(await req.json());

    const existing = await getManageableUser(id);

    if (input.email && input.email !== existing.email) {
      const duplicate = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
      if (duplicate) throw new ApiError("email_already_exists", 409);
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        email: input.email,
        name: input.name,
        role: input.role,
        ...(input.password ? { passwordHash: await bcrypt.hash(input.password, 12) } : {}),
      },
      select: USER_PUBLIC_SELECT,
    });

    await logAudit({
      actor,
      action: "update_user",
      resourceType: "user",
      resourceId: user.id,
      metadata: { email: user.email, previousRole: existing.role, role: user.role, passwordChanged: Boolean(input.password) },
    });

    return jsonOk(user);
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole("HEAD");
    const { id } = await params;
    const existing = await getManageableUser(id);

    await prisma.user.delete({ where: { id } });

    await logAudit({
      actor,
      action: "delete_user",
      resourceType: "user",
      resourceId: id,
      metadata: { email: existing.email, role: existing.role },
    });

    return jsonOk({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
