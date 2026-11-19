import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ movie: { findUnique: vi.fn(), create: vi.fn() }, targetSite: { findMany: vi.fn() }, auditLog: { create: vi.fn() }, $transaction: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));
import { POST } from "./route";
import { rateLimit } from "@/lib/rate-limit";
import { ingestIdentity, videoIngestSchema } from "@/lib/video-ingest";
const payload = { source: "uploader", externalId: "123", title: "Example", slug: "example", content: "Description", mainCategory: "General", tags: ["one", "one"], videoUrl: "https://media.example.com/video.mp4", thumbnailUrl: "https://media.example.com/cover.jpg" };
function request(body: unknown = payload, key = "k".repeat(32)) {
  return new Request("https://example.com/api/integrations/v1/videos", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("VIDEO_INGEST_API_KEY", "k".repeat(32));
  db.movie.findUnique.mockResolvedValue(null);
  db.targetSite.findMany.mockResolvedValue([{ id: "all", mainCategories: [] }, { id: "other", mainCategories: ["Other"] }]);
  db.movie.create.mockImplementation(async ({ data }) => data);
  db.$transaction.mockImplementation(async (fn) => fn(db));
});
afterEach(() => vi.unstubAllEnvs());
describe("video integration", () => {
  it("returns retry timing when rate limited", async () => {
    vi.mocked(rateLimit).mockResolvedValueOnce({ success: false, limit: 60, remaining: 0, resetMs: Date.now() + 30000 });
    const res = await POST(request());
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(db.movie.findUnique).not.toHaveBeenCalled();
  });
  it("requires JSON content type", async () => {
    const req = request(); req.headers.set("content-type", "multipart/form-data");
    expect((await POST(req)).status).toBe(415);
  });
  it("rejects wrong keys before accessing data", async () => {
    expect((await POST(request(payload, "wrong"))).status).toBe(401);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("fails closed without configuration", async () => {
    vi.stubEnv("VIDEO_INGEST_API_KEY", "");
    expect((await POST(request())).status).toBe(503);
  });
  it("creates a draft, deduplicates tags and selects eligible sites", async () => {
    const res = await POST(request());
    expect(res.status).toBe(201);
    expect(db.movie.create.mock.calls[0]?.[0].data).toMatchObject({ status: "DRAFT", targetSiteIds: ["all"], tags: { connectOrCreate: [{ where: { name: "one" }, create: { name: "one" } }] } });
    expect(db.auditLog.create).toHaveBeenCalledOnce();
  });
  it("replays without overwriting editorial changes", async () => {
    const { id, payloadHash } = ingestIdentity(videoIngestSchema.parse(payload));
    db.movie.findUnique.mockResolvedValue({ id, slug: "edited", status: "APPROVED", extraMeta: { ingestPayloadHash: payloadHash } });
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ replayed: true, slug: "edited" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("rejects different data for an existing external ID", async () => {
    db.movie.findUnique.mockResolvedValue({ extraMeta: { ingestPayloadHash: "different" } });
    expect((await POST(request())).status).toBe(409);
  });
  it("handles simultaneous duplicate imports", async () => {
    const { id, payloadHash } = ingestIdentity(videoIngestSchema.parse(payload));
    db.movie.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id, slug: payload.slug, status: "DRAFT", extraMeta: { ingestPayloadHash: payloadHash } });
    db.$transaction.mockRejectedValue({ code: "P2002" });
    expect((await POST(request())).status).toBe(200);
  });
  it("reports slug collisions", async () => {
    db.movie.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "other" });
    db.$transaction.mockRejectedValue({ code: "P2002" });
    const res = await POST(request());
    expect(res.status).toBe(409); expect(await res.json()).toEqual({ error: "slug_conflict" });
  });
  it("rejects unsafe URLs and attempts to publish", async () => {
    expect((await POST(request({ ...payload, videoUrl: "javascript:alert(1)" }))).status).toBe(422);
    expect((await POST(request({ ...payload, status: "DONE" }))).status).toBe(422);
  });
  it("rejects oversized bodies and malformed JSON", async () => {
    expect((await POST(request({ ...payload, content: "a".repeat(262144) }))).status).toBe(413);
    const req = request();
    const invalid = new Request(req.url, { method: "POST", headers: req.headers, body: "{" });
    expect((await POST(invalid)).status).toBe(400);
  });
});
