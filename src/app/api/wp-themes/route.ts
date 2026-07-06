import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { createWordpressThemeSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export async function GET() {
  try {
    await requireMinRole("STAFF");
    const themes = await prisma.wordpressTheme.findMany({
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
      include: { createdBy: { select: { id: true, name: true, email: true } } },
    });
    return jsonOk({ themes });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireMinRole("HEAD");
    const input = createWordpressThemeSchema.parse(await req.json());

    const existing = await prisma.wordpressTheme.findUnique({
      where: { slug_version: { slug: input.slug, version: input.version } },
    });
    if (existing) throw new ApiError("theme_version_already_exists", 409);

    const theme = await prisma.$transaction(async (tx) => {
      if (input.isActive) {
        await tx.wordpressTheme.updateMany({ where: { slug: input.slug, isActive: true }, data: { isActive: false } });
      }

      return tx.wordpressTheme.create({
        data: {
          ...input,
          createdById: actor.id,
        },
      });
    });

    await logAudit({
      actor,
      action: "create_wordpress_theme",
      resourceType: "wordpress_theme",
      resourceId: theme.id,
      metadata: { slug: theme.slug, version: theme.version, isActive: theme.isActive },
    });

    return jsonOk(theme, 201);
  } catch (err) {
    return apiError(err);
  }
}
