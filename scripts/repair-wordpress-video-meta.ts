/**
 * Idempotent WordPress video-meta repair. It never creates posts and defaults
 * to a read-only dry run.
 *
 * Usage:
 *   npm run wordpress:repair-video-meta -- --site-id <targetSiteId> --post-id 48
 *   npm run wordpress:repair-video-meta -- --site-id <targetSiteId> --post-id 48 --apply
 */
import { PrismaClient } from "@prisma/client";
import { decrypt } from "../src/lib/crypto";
import { buildJwPlayerIframeUrl } from "../src/lib/jwplayer";
import { WordPressClient } from "../src/lib/wordpress-client";
import {
  planWordPressVideoRepairs,
  type RepairDistribution,
  type RepairMovie,
} from "../src/lib/wordpress-video-repair";

const prisma = new PrismaClient();
const statuses = ["publish", "future", "draft", "pending", "private"];

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parsePostId(): number | undefined {
  const value = argValue("--post-id");
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("--post-id must be a positive integer");
  return parsed;
}

async function main(): Promise<void> {
  const siteId = argValue("--site-id");
  if (!siteId) throw new Error("Missing required --site-id <targetSiteId>");
  const postId = parsePostId();
  const apply = process.argv.includes("--apply");

  const site = await prisma.targetSite.findUnique({ where: { id: siteId } });
  if (!site) throw new Error(`TargetSite not found: ${siteId}`);

  const credential = decrypt({ ciphertext: site.credentialEnc, iv: site.credentialIv, tag: site.credentialTag });
  const client = new WordPressClient({
    baseUrl: site.baseUrl,
    authType: site.authType,
    username: site.wpUsername,
    credential,
    postType: site.postType,
    categoryRestBase: site.categoryRestBase,
    tagRestBase: site.tagRestBase,
  });

  const [posts, dbMovies, dbDistributions, player] = await Promise.all([
    client.listAllPosts(statuses, { includeContent: true, ...(postId ? { includeIds: [postId] } : {}) }),
    prisma.movie.findMany({
      select: {
        id: true,
        title: true,
        slug: true,
        videoProvider: true,
        videoUrl: true,
        iframeUrl: true,
        thumbnailUrl: true,
        previewUrl: true,
        jwPlayerMediaId: true,
      },
    }),
    prisma.distribution.findMany({
      where: { siteId },
      select: { movieId: true, remotePostId: true },
    }),
    prisma.playerConfig.findFirst({
      where: { provider: "JWPLAYER", isActive: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { playerId: true },
    }),
  ]);

  const movies: RepairMovie[] = dbMovies.map((movie) => ({
    ...movie,
    iframeUrl:
      movie.iframeUrl ??
      (movie.videoProvider === "jwplayer" ? buildJwPlayerIframeUrl(movie.jwPlayerMediaId, player) ?? null : null),
  }));
  const plans = planWordPressVideoRepairs(posts, movies, dbDistributions as RepairDistribution[]);
  const report = {
    mode: apply ? "apply" : "dry-run",
    siteId,
    site: site.baseUrl,
    filterPostId: postId ?? null,
    scanned: posts.length,
    candidates: plans.length,
    repairs: plans.filter((plan) => plan.status === "repair").length,
    noops: plans.filter((plan) => plan.status === "noop").length,
    unmatched: plans.filter((plan) => plan.status === "unmatched").length,
    posts: plans,
  };

  // Always print the complete plan before the first write, including --apply.
  console.log(JSON.stringify(report, null, 2));
  if (!apply) return;

  let repaired = 0;
  const failures: Array<{ postId: number; error: string }> = [];
  for (const plan of plans) {
    if (plan.status !== "repair" || !plan.movieId || !plan.expectedMeta) continue;
    try {
      await client.updatePostMeta(plan.postId, plan.expectedMeta);
      await client.verifyVideoMeta(plan.postId, plan.expectedMeta);
      await prisma.distribution.upsert({
        where: { movieId_siteId: { movieId: plan.movieId, siteId } },
        update: {
          status: "SUCCESS",
          remotePostId: String(plan.postId),
          remotePostUrl: plan.postUrl,
          errorMessage: null,
          distributedAt: new Date(),
        },
        create: {
          movieId: plan.movieId,
          siteId,
          status: "SUCCESS",
          remotePostId: String(plan.postId),
          remotePostUrl: plan.postUrl,
          attempts: 1,
          distributedAt: new Date(),
        },
      });
      await prisma.auditLog.create({
        data: {
          actorId: null,
          actorRole: "SYSTEM",
          action: "repair_wordpress_video_meta",
          resourceType: "wordpress_post",
          resourceId: `${siteId}:${plan.postId}`,
          metadata: {
            movieId: plan.movieId,
            remotePostId: String(plan.postId),
            strategy: plan.strategy,
            changedFields: plan.changedFields,
          },
        },
      });
      repaired += 1;
    } catch (error) {
      failures.push({
        postId: plan.postId,
        error: error instanceof Error ? error.message : "Unknown repair error",
      });
    }
  }

  console.log(JSON.stringify({ applied: true, repaired, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
