import { prisma } from "@/lib/prisma";
import { apiError, jsonOk } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";

/** Ranks tags by real usage across every movie (not a curated list) — Tag.movies is the real many-to-many relation now, so this is a plain count/orderBy. */
export async function GET() {
  try {
    await requireMinRole("STAFF");

    const rows = await prisma.tag.findMany({
      orderBy: [{ movies: { _count: "desc" } }, { name: "asc" }],
      take: 20,
      include: { _count: { select: { movies: true } } },
    });

    return jsonOk(rows.map((r) => ({ tag: r.name, count: r._count.movies })));
  } catch (err) {
    return apiError(err);
  }
}
