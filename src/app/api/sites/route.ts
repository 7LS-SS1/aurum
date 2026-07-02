import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { createSiteSchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

// Fields intentionally excluded: credentialEnc / credentialIv / credentialTag.
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

export async function GET() {
  try {
    await requireMinRole("STAFF");
    const sites = await prisma.targetSite.findMany({ select: SITE_PUBLIC_SELECT, orderBy: { createdAt: "asc" } });
    return jsonOk(sites);
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireMinRole("MANAGER"); // manager+ may register a site + its credential

    const { success } = await rateLimit(`sites:create:${actor.id}`, { limit: 10, windowMs: 60_000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const input = createSiteSchema.parse(await req.json());
    const enc = encrypt(input.credential);

    const site = await prisma.targetSite.create({
      data: {
        name: input.name,
        baseUrl: input.baseUrl,
        authType: input.authType,
        wpUsername: input.wpUsername,
        credentialEnc: enc.ciphertext,
        credentialIv: enc.iv,
        credentialTag: enc.tag,
        postType: input.postType,
        categoryRestBase: input.categoryRestBase,
        tagRestBase: input.tagRestBase,
        defaultStatus: input.defaultStatus,
      },
      select: SITE_PUBLIC_SELECT,
    });

    await logAudit({ actor, action: "create_site", resourceType: "site", resourceId: site.id, metadata: { name: site.name, baseUrl: site.baseUrl } });

    return jsonOk(site, 201);
  } catch (err) {
    return apiError(err);
  }
}
