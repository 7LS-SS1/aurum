import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { movieSiteDraftSchema } from "@/lib/validation";
import { ApiError, apiError, jsonOk } from "@/lib/api-response";
import { titleIdentity } from "@/lib/content-seo";
import { requireMinRole } from "@/lib/authz";

/** Per-(movie, site) content override — same video, different title/copy per destination. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; siteId: string }> }) {
  try {
    await requireMinRole("STAFF");
    const { id, siteId } = await params;
    const draft = await prisma.movieSiteDraft.findUnique({
      where: { movieId_siteId: { movieId: id, siteId } },
    });
    return jsonOk(draft ?? null);
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; siteId: string }> }) {
  try {
    await requireMinRole("STAFF");
    const { id, siteId } = await params;
    const parsed = movieSiteDraftSchema.parse(await req.json());
    const input = { ...parsed, extraMeta: parsed.extraMeta as Prisma.InputJsonValue | undefined };

    const draft = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"content-seo:" + id}))`;
      const others = await tx.movieSiteDraft.findMany({ where: { movieId: id } });
      if (parsed.title && others.some(other => other.siteId !== siteId && other.title && titleIdentity(other.title) === titleIdentity(parsed.title!))) {
        throw new ApiError("ชื่อนี้ถูกใช้ในเว็บไซต์อื่นของวิดีโอเดียวกันแล้ว", 409);
      }
      return tx.movieSiteDraft.upsert({
        where: { movieId_siteId: { movieId: id, siteId } },
        update: input,
        create: { movieId: id, siteId, ...input },
      });
    });

    return jsonOk(draft);
  } catch (err) {
    return apiError(err);
  }
}
