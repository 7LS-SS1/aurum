import { prisma } from "@/lib/prisma";
import { apiError, jsonOk } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";

interface PopularTagRow {
  tag: string;
  count: bigint;
}

/**
 * Ranks tags by real usage across every movie (not a curated list) —
 * jsonb_array_elements_text unnests each movie's `tags` array so COUNT(*)
 * reflects how often a tag has actually been applied.
 */
export async function GET() {
  try {
    await requireMinRole("STAFF");

    const rows = await prisma.$queryRaw<PopularTagRow[]>`
      SELECT value AS tag, COUNT(*) AS count
      FROM movies, jsonb_array_elements_text(tags) AS value
      GROUP BY value
      ORDER BY COUNT(*) DESC, value ASC
      LIMIT 20
    `;

    return jsonOk(rows.map((r) => ({ tag: r.tag, count: Number(r.count) })));
  } catch (err) {
    return apiError(err);
  }
}
