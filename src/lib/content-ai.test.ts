import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const mocks = vi.hoisted(() => ({
  config: vi.fn(), movie: vi.fn(), site: vi.fn(), drafts: vi.fn(),
  latestMovie: vi.fn(), latestDrafts: vi.fn(), lock: vi.fn(), upsert: vi.fn(), generate: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {
  contentAiConfig: { findUnique: mocks.config }, movie: { findUniqueOrThrow: mocks.movie },
  targetSite: { findUniqueOrThrow: mocks.site }, movieSiteDraft: { findMany: mocks.drafts },
  $transaction: async (callback: (tx: unknown) => unknown) => callback({
    $executeRaw: mocks.lock, movie: { findUniqueOrThrow: mocks.latestMovie },
    movieSiteDraft: { findMany: mocks.latestDrafts, upsert: mocks.upsert },
  }),
} }));
vi.mock("@/lib/crypto", () => ({ decrypt: () => "key" }));
vi.mock("@/lib/content-seo", async importOriginal => ({ ...await importOriginal<object>(), generateSeo: mocks.generate }));
import { ensureSiteSeo, readAiConfig } from "./content-ai";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.config.mockResolvedValue({ enabled: true, model: "test", apiKeyEnc: "e", apiKeyIv: "i", apiKeyTag: "t" });
  mocks.movie.mockResolvedValue({ title: "ของเล่นมาใหม่", tags: [{ name: "ของเล่น" }] });
  mocks.site.mockResolvedValue({ name: "Site", isActive: true });
  mocks.drafts.mockResolvedValue([]);
  mocks.latestMovie.mockResolvedValue({ title: "ของเล่นมาใหม่" });
  mocks.latestDrafts.mockResolvedValue([]);
  mocks.generate.mockResolvedValue({ title: "อัปเดตของเล่นมาใหม่", description: "รายละเอียดของเล่นมาใหม่" });
  mocks.upsert.mockImplementation(async args => args.create);
});
describe("persisted site SEO", () => {
  it("skips oversized automatic tag inputs and retains usable keywords", async () => {
    mocks.movie.mockResolvedValue({ title: "ของเล่นมาใหม่", tags: [{ name: "ก".repeat(101) }, { name: "ของเล่น" }] });
    await ensureSiteSeo("m", "s");
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ keywords: ["ของเล่น"] }));
  });
  it("reports unavailable automatic keywords without saving an invalid draft", async () => {
    mocks.movie.mockResolvedValue({ title: "ก".repeat(110), tags: [] });
    await expect(ensureSiteSeo("m", "s")).rejects.toMatchObject({ reason: "seo_keywords_unavailable" });
    expect(mocks.generate).not.toHaveBeenCalled(); expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("does not persist rejected generation", async () => {
    mocks.generate.mockRejectedValue(new Error("seo_generation_validation_failed:seo_original_title_required"));
    await expect(ensureSiteSeo("m", "s")).rejects.toThrow("seo_generation_validation_failed:seo_original_title_required");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("uses original content as context and rejects generation if that content changes in flight", async () => {
    mocks.movie.mockResolvedValue({ title: "ของเล่นมาใหม่", content: "<p>เนื้อหาเดิม</p>", excerpt: "สรุป", tags: [{ name: "ของเล่น" }] });
    mocks.latestMovie.mockResolvedValue({ title: "ของเล่นมาใหม่", content: "เนื้อหาแก้ไขแล้ว", excerpt: "สรุป" });
    await expect(ensureSiteSeo("m", "s")).rejects.toThrow("seo_source_changed_retry");
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ sourceContext: "สรุป เนื้อหาเดิม" }));
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("reports an actionable setup error instead of hiding a missing table on settings reads", async () => {
    mocks.config.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Missing table", { code: "P2021", clientVersion: "test" }));
    await expect(readAiConfig({ requireStorage: true })).rejects.toMatchObject({ status: 503, message: expect.stringContaining("prisma migrate deploy") });
    expect(await readAiConfig()).toBeNull();
  });
  it("reports schema drift separately from an unconfigured integration", async () => {
    mocks.config.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Missing column", { code: "P2022", clientVersion: "test" }));
    await expect(readAiConfig()).rejects.toMatchObject({ status: 503, message: expect.stringContaining("โครงสร้างตาราง AI") });
  });
  it("does not call OpenAI when disabled", async () => {
    mocks.config.mockResolvedValue({ enabled: false });
    expect(await ensureSiteSeo("m", "s")).toBeUndefined();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("limits automatic tag keywords to 15 distinct values before generation", async () => {
    mocks.movie.mockResolvedValue({ title: "ของเล่นมาใหม่", tags: Array.from({ length: 20 }, (_, index) => ({ name: `คำ${index + 1}` })) });
    await ensureSiteSeo("m", "s");
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({
      keywords: Array.from({ length: 15 }, (_, index) => `คำ${index + 1}`),
    }));
  });
  it("uses the source title when an untagged movie has no keywords", async () => {
    mocks.movie.mockResolvedValue({ title: "ของเล่นมาใหม่", tags: [] });
    await ensureSiteSeo("m", "s");
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ keywords: ["ของเล่นมาใหม่"] }));
  });
  it("reuses a saved or manually authored title without spending another request", async () => {
    const draft = { siteId: "s", title: "ชื่อที่ตรวจแล้ว" };
    mocks.drafts.mockResolvedValue([draft]);
    expect(await ensureSiteSeo("m", "s")).toEqual(draft);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("saves all three Rank Math fields and preserves other draft metadata", async () => {
    mocks.latestDrafts.mockResolvedValue([{ siteId: "s", title: null, extraMeta: { custom: "keep" } }]);
    const result = await ensureSiteSeo("m", "s");
    expect(result).toMatchObject({ title: "อัปเดตของเล่นมาใหม่", extraMeta: {
      custom: "keep", rank_math_title: "อัปเดตของเล่นมาใหม่", rank_math_description: "รายละเอียดของเล่นมาใหม่", rank_math_focus_keyword: "ของเล่น",
    } });
    expect(mocks.lock).toHaveBeenCalledTimes(1);
  });
  it("regenerates when another site reserves the title during the model request", async () => {
    mocks.latestDrafts.mockResolvedValueOnce([{ siteId: "other", title: "อัปเดต ของเล่นมาใหม่!" }]).mockResolvedValueOnce([]);
    mocks.generate.mockResolvedValueOnce({ title: "อัปเดตของเล่นมาใหม่", description: "คำอธิบาย" }).mockResolvedValueOnce({ title: "รู้จักของเล่นมาใหม่", description: "คำอธิบาย" });
    expect(await ensureSiteSeo("m", "s")).toMatchObject({ title: "รู้จักของเล่นมาใหม่" });
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
  it("does not overwrite a concurrent manual edit", async () => {
    mocks.latestDrafts.mockResolvedValue([{ siteId: "s", title: "ชื่อจากบรรณาธิการ" }]);
    expect(await ensureSiteSeo("m", "s")).toMatchObject({ title: "ชื่อจากบรรณาธิการ" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("rejects a changed source title and never saves stale generation", async () => {
    mocks.latestMovie.mockResolvedValue({ title: "ชื่อใหม่" });
    await expect(ensureSiteSeo("m", "s")).rejects.toThrow("seo_source_changed_retry");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
