import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateActorSchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireMinRole("STAFF");
    const { id } = await params;
    const actorRow = await prisma.actor.findUnique({ where: { id } });
    if (!actorRow) throw new ApiError("actor_not_found", 404);
    return jsonOk(actorRow);
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("STAFF");
    const { id } = await params;
    const input = updateActorSchema.parse(await req.json());

    const existing = await prisma.actor.findUnique({ where: { id } });
    if (!existing) throw new ApiError("actor_not_found", 404);

    const updated = await prisma.actor.update({ where: { id }, data: input });
    await logAudit({ actor, action: "update_actor", resourceType: "actor", resourceId: id });

    return jsonOk(updated);
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("STAFF");
    const { id } = await params;

    const existing = await prisma.actor.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!existing) throw new ApiError("actor_not_found", 404);

    await prisma.actor.delete({ where: { id } });
    await logAudit({ actor, action: "delete_actor", resourceType: "actor", resourceId: id, metadata: { name: existing.name } });

    return jsonOk({ deleted: true, id });
  } catch (err) {
    return apiError(err);
  }
}
