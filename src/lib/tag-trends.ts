import { prisma } from "@/lib/prisma";

/**
 * Tags never offered as suggestions (popular, trending, or title match):
 * sexual violence / non-consent, incest, minors, covert recording, drugging.
 * They can still exist on old content, but the UI never promotes them.
 */
const BLOCKED = [
  /ข่มขืน/, /บังคับ/, /ฉุด/, /มอมยา/, /วางยา/, /ยานอนหลับ/, /หลับ/, /ไม่ยินยอม/, /แอบถ่าย/, /กล้องแอบ/, /แอบดู/,
  /ครอบครัว/, /พ่อเลี้ยง/, /แม่เลี้ยง/, /ลูกเลี้ยง/, /แม่ยาย/, /พ่อตา/, /เย็ดแม่/, /เย็ดพ่อ/, /เย็ดลูก/, /เย็ดน้อง/, /เย็ดพี่/, /ลูกเขย/, /ลูกสะใภ้/, /พี่น้อง/, /น้องสาว/, /พี่สาว/, /ลูกสาว/, /หลานสาว/, /ญาติ/,
  /เด็ก/, /นักเรียน/, /มัธยม/, /ประถม/, /ผู้เยาว์/, /เยาวชน/, /ละอ่อน/, /ม\.?[1-6]/, /อายุต่ำกว่า/,
  /rape/, /forced/, /non.?consent/, /drugged/, /asleep/, /sleeping/, /hidden.?cam/, /spy.?cam/, /voyeur/, /upskirt/,
  /incest/, /step.?(sis|bro|dad|mom|daughter|son)/, /family/, /teen/, /minor/, /underage/, /school/, /loli/, /child/, /kid/,
];
export function isSuggestable(tag: string) {
  const text = tag.normalize("NFC").toLowerCase().replace(/\s+/g, "");
  return !BLOCKED.some((pattern) => pattern.test(text));
}

export interface TrendingTag { tag: string; recent: number; previous: number; growth: number; score: number }

/**
 * Ranks tags by momentum: uses in movies created during the last `days`
 * versus the `days` before that. Score favours tags that are both used often
 * now and growing; brand-new tags get a boost but need at least 2 uses.
 */
export function rankTrending(rows: Array<{ tag: string; recent: number; previous: number }>, limit = 20): TrendingTag[] {
  return rows
    .filter((row) => row.recent >= 2 && row.recent > row.previous && isSuggestable(row.tag))
    .map((row) => {
      const growth = row.previous === 0 ? 1 : (row.recent - row.previous) / row.previous;
      return { ...row, growth, score: row.recent * (1 + Math.min(growth, 3)) };
    })
    .sort((a, b) => b.score - a.score || b.recent - a.recent || a.tag.localeCompare(b.tag, "th"))
    .slice(0, limit);
}

export async function trendingTags(days = 7, limit = 20) {
  const now = Date.now();
  const recentFrom = new Date(now - days * 86_400_000);
  const previousFrom = new Date(now - 2 * days * 86_400_000);
  const rows = await prisma.$queryRaw<Array<{ tag: string; recent: bigint; previous: bigint }>>`
    SELECT t.name AS tag,
      COUNT(*) FILTER (WHERE m.created_at >= ${recentFrom}) AS recent,
      COUNT(*) FILTER (WHERE m.created_at < ${recentFrom}) AS previous
    FROM "_MovieToTag" mt
    JOIN movies m ON m.id = mt."A"
    JOIN tags t ON t.id = mt."B"
    WHERE m.created_at >= ${previousFrom}
    GROUP BY t.name`;
  return rankTrending(rows.map((row) => ({ tag: row.tag, recent: Number(row.recent), previous: Number(row.previous) })), limit);
}

/** Existing tags whose name appears in the title, or that share a word with it. */
export function matchTagsToTitle(title: string, tags: string[], limit = 12) {
  const text = title.toLowerCase().replace(/\s+/g, "");
  const words = title.toLowerCase().split(/[\s,|/\-_.]+/).filter((word) => word.length >= 2);
  if (!text) return [];
  return tags
    .filter(isSuggestable)
    .map((tag) => {
      const name = tag.toLowerCase();
      const compact = name.replace(/\s+/g, "");
      const score = compact.length >= 2 && text.includes(compact) ? compact.length * 2 : words.some((word) => name.includes(word)) ? 1 : 0;
      return { tag, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.tag);
}
