/**
 * Collapse every AURUM-managed WordPress post on one destination to its single
 * controlled Movie.mainCategory. Dry-run is the default.
 *
 * Usage:
 *   npx tsx scripts/repair-wordpress-video-categories.ts --site thaitube.live
 *   npx tsx scripts/repair-wordpress-video-categories.ts --site thaitube.live --apply
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { decrypt } from "../src/lib/crypto";

type WpTerm = { id: number; name: string; slug: string; parent: number; count: number };
type BackupPost = {
  movieId: string;
  postId: number;
  postType: string;
  taxonomy: string;
  mainCategory: string;
  previousTermIds: number[];
  nextTermIds: number[];
};

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const requestedSite = args[args.indexOf("--site") + 1];
const apply = args.includes("--apply");

if (!requestedSite || requestedSite.startsWith("--")) {
  throw new Error("Pass --site with a destination name or hostname");
}
const siteNeedle: string = requestedSite;

function asIds(value: unknown): number[] {
  return Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [];
}

async function main() {
  const sites = await prisma.targetSite.findMany();
  const needle = siteNeedle.toLocaleLowerCase();
  const matches = sites.filter((site) =>
    site.name.toLocaleLowerCase().includes(needle) || site.baseUrl.toLocaleLowerCase().includes(needle),
  );
  if (matches.length !== 1) throw new Error(`Expected exactly one site match, found ${matches.length}`);
  const site = matches[0]!;
  const password = decrypt({ ciphertext: site.credentialEnc, iv: site.credentialIv, tag: site.credentialTag });
  const authorization = `Basic ${Buffer.from(`${site.wpUsername}:${password}`).toString("base64")}`;
  const api = `${site.baseUrl.replace(/\/$/, "")}/wp-json/wp/v2`;
  const headers = { Authorization: authorization, "Content-Type": "application/json" };

  async function request<T>(url: string, init?: RequestInit): Promise<{ data: T; response: Response }> {
    const response = await fetch(url, { ...init, headers: { ...headers, ...init?.headers } });
    const text = await response.text();
    if (!response.ok) throw new Error(`WordPress HTTP ${response.status}: ${text.slice(0, 500)}`);
    return { data: (text ? JSON.parse(text) : null) as T, response };
  }

  async function allTerms(restBase: string): Promise<WpTerm[]> {
    const first = await request<WpTerm[]>(`${api}/${restBase}?context=edit&hide_empty=false&per_page=100&page=1`);
    const pages = Number(first.response.headers.get("x-wp-totalpages") || 1);
    const terms = [...first.data];
    for (let page = 2; page <= pages; page += 1) {
      terms.push(...(await request<WpTerm[]>(`${api}/${restBase}?context=edit&hide_empty=false&per_page=100&page=${page}`)).data);
    }
    return terms;
  }

  const distributions = await prisma.distribution.findMany({
    where: { siteId: site.id, remotePostId: { not: null }, movie: { mainCategory: { not: null } } },
    select: {
      remotePostId: true,
      remotePostType: true,
      remoteCategoryRestBase: true,
      movie: { select: { id: true, mainCategory: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const profiles = new Map<string, { postType: string; taxonomy: string }>();
  for (const row of distributions) {
    const postType = row.remotePostType || site.postType;
    const taxonomy = row.remoteCategoryRestBase || site.categoryRestBase;
    profiles.set(`${postType}\0${taxonomy}`, { postType, taxonomy });
  }

  const termIds = new Map<string, Map<string, number>>();
  const beforeTerms: Record<string, WpTerm[]> = {};
  for (const { taxonomy } of profiles.values()) {
    if (termIds.has(taxonomy)) continue;
    const terms = await allTerms(taxonomy);
    beforeTerms[taxonomy] = terms;
    const byName = new Map<string, number>();
    for (const name of ["AV", "คลิปหลุด"]) {
      const exact = terms.find((term) => term.parent === 0 && term.name.toLocaleLowerCase() === name.toLocaleLowerCase());
      if (!exact) throw new Error(`Missing top-level ${taxonomy} term: ${name}`);
      byName.set(name, exact.id);
    }
    termIds.set(taxonomy, byName);
  }

  const backupPosts: BackupPost[] = [];
  const missingPosts: Array<{ movieId: string; postId: number; postType: string; taxonomy: string }> = [];
  let changed = 0;
  for (const row of distributions) {
    const postId = Number(row.remotePostId);
    const postType = row.remotePostType || site.postType;
    const taxonomy = row.remoteCategoryRestBase || site.categoryRestBase;
    const mainCategory = row.movie.mainCategory!;
    const nextId = termIds.get(taxonomy)?.get(mainCategory);
    if (!nextId) throw new Error(`Unsupported main category for movie ${row.movie.id}: ${mainCategory}`);
    let post: Record<string, unknown>;
    try {
      post = (await request<Record<string, unknown>>(`${api}/${postType}/${postId}?context=edit`)).data;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("WordPress HTTP 404:")) {
        missingPosts.push({ movieId: row.movie.id, postId, postType, taxonomy });
        continue;
      }
      throw error;
    }
    const previousTermIds = asIds(post[taxonomy]);
    const nextTermIds = [nextId];
    backupPosts.push({ movieId: row.movie.id, postId, postType, taxonomy, mainCategory, previousTermIds, nextTermIds });
    if (previousTermIds.length === 1 && previousTermIds[0] === nextId) continue;
    changed += 1;
    if (apply) {
      const updated = await request<Record<string, unknown>>(`${api}/${postType}/${postId}`, {
        method: "POST",
        body: JSON.stringify({ [taxonomy]: nextTermIds }),
      });
      const actual = asIds(updated.data[taxonomy]);
      if (actual.length !== 1 || actual[0] !== nextId) throw new Error(`Taxonomy verification failed for ${postType}/${postId}`);
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.resolve("backups", "wordpress-category-repair");
  await mkdir(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `${timestamp}-${new URL(site.baseUrl).hostname}.json`);
  const deletedTerms: Record<string, WpTerm[]> = {};
  const retainedNonMainTerms: Record<string, WpTerm[]> = {};
  const termDeletionFailures: Record<string, Array<WpTerm & { error: string }>> = {};

  if (apply) {
    for (const { taxonomy } of profiles.values()) {
      if (deletedTerms[taxonomy]) continue;
      const keepIds = new Set(termIds.get(taxonomy)!.values());
      const refreshed = await allTerms(taxonomy);
      deletedTerms[taxonomy] = [];
      retainedNonMainTerms[taxonomy] = [];
      termDeletionFailures[taxonomy] = [];
      for (const term of refreshed) {
        if (keepIds.has(term.id)) continue;
        if (term.count > 0) {
          retainedNonMainTerms[taxonomy].push(term);
          continue;
        }
        try {
          await request(`${api}/${taxonomy}/${term.id}?force=true`, { method: "DELETE" });
          deletedTerms[taxonomy].push(term);
        } catch (error) {
          termDeletionFailures[taxonomy].push({
            ...term,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(), mode: apply ? "apply" : "dry-run",
    site: { id: site.id, name: site.name, baseUrl: site.baseUrl },
    totals: { distributions: distributions.length, postsFound: backupPosts.length, postsMissing: missingPosts.length, postsNeedingChange: changed },
    beforeTerms, posts: backupPosts, missingPosts, deletedTerms, retainedNonMainTerms, termDeletionFailures,
  };
  await writeFile(backupPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ mode: report.mode, site: report.site, totals: report.totals, deletedTerms, retainedNonMainTerms, termDeletionFailures, backupPath }, null, 2));
}

main().finally(() => prisma.$disconnect());
