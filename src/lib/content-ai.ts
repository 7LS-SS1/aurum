import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { generateSeo, keywordsSchema, seoSourceContext, titleIdentity, SeoGenerationValidationError } from "@/lib/content-seo";
import { ApiError } from "@/lib/api-response";
import { aiProvider, type AiProvider } from "@/lib/ai-provider";

export async function readAiConfig(options: { requireStorage?: boolean; provider?: AiProvider } = {}) {
  if (!prisma.contentAiConfig) {
    throw new ApiError("ระบบยังใช้ Prisma Client รุ่นเก่า กรุณารัน npx prisma generate แล้วเริ่มเซิร์ฟเวอร์ใหม่", 503);
  }
  try {
    const config = await prisma.contentAiConfig.findUnique({ where: { id: options.provider ? `provider:${options.provider}` : "default" } });
    if (config) {
      const provider = aiProvider(config.provider);
      if (options.provider && provider !== options.provider) throw new ApiError("ข้อมูลผู้ให้บริการ AI ไม่ตรงกัน กรุณาบันทึกการตั้งค่าใหม่", 503);
    }
    return config;
  }
  catch (error) {
    // Older installations continue distributing normally until the migration is applied.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
      if (options.requireStorage) throw new ApiError("ยังไม่มีตารางตั้งค่า AI กรุณารัน npx prisma migrate deploy แล้วลองอีกครั้ง", 503);
      return null;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
      throw new ApiError("โครงสร้างตาราง AI ยังไม่ตรงกับแอป กรุณารัน npx prisma migrate deploy", 503);
    }
    throw error;
  }
}

/** Persist before publication, reuse on retries, and serialize reservations per movie. */
export async function ensureSiteSeo(movieId: string, siteId: string, requestedKeywords?: string[]) {
  const config = await readAiConfig();
  if (!config?.enabled) return undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    const [movie, site, drafts] = await Promise.all([
      prisma.movie.findUniqueOrThrow({ where: { id: movieId }, include: { tags: true } }),
      prisma.targetSite.findUniqueOrThrow({ where: { id: siteId } }),
      prisma.movieSiteDraft.findMany({ where: { movieId } }),
    ]);
    if (!site.isActive) throw new Error("site_inactive");
    const current = drafts.find(draft => draft.siteId === siteId);
    // A manually authored title is an editorial decision; never silently replace it.
    if (current?.title) return current;
    // The editor can attach more tags than the model input contract allows.
    // Keep the first 15 distinct values instead of failing every destination
    // before WordPress is contacted. A title fallback also lets untagged
    // movies use automatic SEO.
    const keywordCandidates = requestedKeywords ?? movie.tags.map(tag => tag.name);
    const distinctKeywords = [...new Map(
      keywordCandidates.map(keyword => [keyword.trim().toLocaleLowerCase("th"), keyword.trim()]),
    ).values()].filter(Boolean);
    const candidates = distinctKeywords.length ? distinctKeywords : [movie.title.trim()];
    const usableKeywords = requestedKeywords ? candidates : candidates.filter(keyword => keyword.length <= 100);
    if (!usableKeywords.length) throw new SeoGenerationValidationError("seo_keywords_unavailable");
    const keywords = keywordsSchema.parse(usableKeywords.slice(0, 15));
    const result = await generateSeo({
      apiKey: decrypt({ ciphertext: config.apiKeyEnc, iv: config.apiKeyIv, tag: config.apiKeyTag }),
      provider: aiProvider(config.provider), model: config.model, title: movie.title, keywords, site: site.name,
      sourceContext: seoSourceContext(movie.content, movie.excerpt),
      forbidden: drafts.flatMap(draft => draft.title ? [draft.title] : []),
    });
    const saved = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"content-seo:" + movieId}))`;
      const latestMovie = await tx.movie.findUniqueOrThrow({ where: { id: movieId } });
      if (latestMovie.title !== movie.title ||
          seoSourceContext(latestMovie.content, latestMovie.excerpt) !== seoSourceContext(movie.content, movie.excerpt)) {
        throw new Error("seo_source_changed_retry");
      }
      const latest = await tx.movieSiteDraft.findMany({ where: { movieId } });
      const existing = latest.find(draft => draft.siteId === siteId);
      if (existing?.title) return existing;
      if (latest.some(draft => draft.title && titleIdentity(draft.title) === titleIdentity(result.title))) return null;
      const extra = existing?.extraMeta && typeof existing.extraMeta === "object" && !Array.isArray(existing.extraMeta) ? existing.extraMeta : {};
      const data = { title: result.title, extraMeta: {
        ...extra, rank_math_title: result.title, rank_math_description: result.description,
        rank_math_focus_keyword: keywords.join(", "),
      } };
      return tx.movieSiteDraft.upsert({ where: { movieId_siteId: { movieId, siteId } },
        create: { movieId, siteId, ...data }, update: data });
    });
    if (saved) return saved;
  }
  throw new Error("seo_duplicate_title_retry");
}
