import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { updateSiteSchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole, requireRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

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
  mainCategories: true,
  isActive: true,
  healthStatus: true,
  lastCheckedAt: true,
  createdAt: true,
} as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("MANAGER");
    const { id } = await params;
    const input = updateSiteSchema.parse(await req.json());

    const existing = await prisma.targetSite.findUnique({ where: { id } });
    if (!existing) throw new ApiError("site_not_found", 404);

    const enc = input.credential ? encrypt(input.credential) : null;

    const nextProfile = {
      postType: input.postType ?? existing.postType,
      categoryRestBase: input.categoryRestBase ?? existing.categoryRestBase,
      tagRestBase: input.tagRestBase ?? existing.tagRestBase,
    };
    const profileChanged = nextProfile.postType !== existing.postType
      || nextProfile.categoryRestBase !== existing.categoryRestBase
      || nextProfile.tagRestBase !== existing.tagRestBase;

    const site = await prisma.$transaction(async (tx) => {
      if (profileChanged) {
        // Freeze the old REST route on every existing remote record before the
        // site starts publishing new records to another collection. Without
        // this snapshot, later updates/engagement sync would address an old
        // `posts/{id}` record as `video/{id}` (or vice versa).
        await tx.distribution.updateMany({
          where: { siteId: id, remotePostId: { not: null }, remotePostType: null },
          data: {
            remotePostType: existing.postType,
            remoteCategoryRestBase: existing.categoryRestBase,
            remoteTagRestBase: existing.tagRestBase,
          },
        });
      }

      return tx.targetSite.update({
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
          mainCategories: input.mainCategories,
          isActive: input.isActive,
          ...(enc ? { credentialEnc: enc.ciphertext, credentialIv: enc.iv, credentialTag: enc.tag } : {}),
        },
        select: SITE_PUBLIC_SELECT,
      });
    });

    const action = input.isActive === false && existing.isActive ? "disable_site" : input.isActive === true && !existing.isActive ? "enable_site" : "update_site";
    await logAudit({ actor, action, resourceType: "site", resourceId: site.id });

    return jsonOk(site);
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole("HEAD");
    const { id } = await params;
    const existing = await prisma.targetSite.findUnique({ where: { id } });
    if (!existing) throw new ApiError("site_not_found", 404);

    await prisma.targetSite.delete({ where: { id } });

    await logAudit({ actor, action: "delete_site", resourceType: "site", resourceId: id, metadata: { name: existing.name } });

    return jsonOk({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
