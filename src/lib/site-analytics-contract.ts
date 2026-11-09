import { z } from "zod";
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const topVideo = z.object({ postId: z.number().int().positive(), title: z.string().max(500), count });
export const siteSnapshotSchema = z.object({
  version: z.literal(1), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startedAt: z.string(), visitors: count, views: count, likes: count,
  topViews: z.array(topVideo).max(5), topLikes: z.array(topVideo).max(5),
  publishedVideos: count, nativePlayer: z.literal(true), iframeTracking: z.literal(false),
  likeAdapter: z.boolean(),
});
export type SiteSnapshot = z.infer<typeof siteSnapshotSchema>;
export type SiteReport = { id: string; name: string; baseUrl: string; isActive: boolean; snapshot: SiteSnapshot | null; syncedAt: string | null; error: string | null; search: SearchSnapshot | null; searchError: string | null; searchSyncedAt: string | null };
const metric = z.number().finite().nonnegative();
export const searchSnapshotSchema = z.object({ from:z.string(), to:z.string(), property:z.string(), rows:z.array(z.object({query:z.string(),clicks:metric,impressions:metric,ctr:metric,position:metric})).max(10) });
export type SearchSnapshot = z.infer<typeof searchSnapshotSchema>;
export function topSites(sites: SiteReport[], metric: "views" | "likes") {
  return sites.filter(site => site.snapshot && (metric !== "likes" || site.snapshot.likeAdapter))
    .sort((a,b) => b.snapshot![metric]-a.snapshot![metric] || a.name.localeCompare(b.name)).slice(0,5);
}
