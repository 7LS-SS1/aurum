import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { updateSiteSchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireRole } from "@/lib/authz";

const SITE_PUBLIC_SELECT = {
  id: true,
  name: true,
  baseUrl: true,
  authType: true,
  wpUsername: true,
  postType: true,
  categoryRestBase: true,
  tagRestBase: true,
  defaultStatus: true,
  isActive: true,
  healthStatus: true,
  lastCheckedAt: true,
  createdAt: true,
} as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("ADMIN");
    const { id } = await params;
    const input = updateSiteSchema.parse(await req.json());

    const existing = await prisma.targetSite.findUnique({ where: { id } });
    if (!existing) throw new ApiError("site_not_found", 404);

    const enc = input.credential ? encrypt(input.credential) : null;

    const site = await prisma.targetSite.update({
      where: { id },
      data: {
        name: input.name,
        baseUrl: input.baseUrl,
        authType: input.authType,
        wpUsername: input.wpUsername,
        postType: input.postType,
        categoryRestBase: input.categoryRestBase,
        tagRestBase: input.tagRestBase,
        defaultStatus: input.defaultStatus,
        isActive: input.isActive,
        ...(enc ? { credentialEnc: enc.ciphertext, credentialIv: enc.iv, credentialTag: enc.tag } : {}),
      },
      select: SITE_PUBLIC_SELECT,
    });

    return jsonOk(site);
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("ADMIN");
    const { id } = await params;
    await prisma.targetSite.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
