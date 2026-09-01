import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { reorderComicImagesSchema } from "@/lib/validation";
import { apiError, jsonOk } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";

export async function POST(req: NextRequest) {
  try {
    await requireMinRole("STAFF");
    const input = reorderComicImagesSchema.parse(await req.json());

    await prisma.$transaction(
      input.items.map((item) => prisma.comicChapterImage.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } })),
    );

    return jsonOk({ reordered: input.items.length });
  } catch (err) {
    return apiError(err);
  }
}
