import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mock = vi.hoisted(() => ({ find: vi.fn(), rate: vi.fn() }));
vi.mock("@/lib/ads-orders", () => ({ locked: (fn: (tx: unknown) => unknown) => fn({ adsOrder: { findMany: mock.find } }), orderWebsite: (q: { website?: { id: string } }) => q.website?.id || null }));
vi.mock("@/lib/ads-page-store", () => ({ getAdsPage: async () => ({ config: { websites: [{ id: "11111111-1111-4111-8111-111111111111", enabled: true }], inventoryCounts: {} } }) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mock.rate }));
import { GET } from "./route";
const site = "11111111-1111-4111-8111-111111111111";
const request = (key = "a".repeat(48)) => new NextRequest("https://aurum.example/api/public/ads-plugin?websiteId="+site, { headers: { Authorization: "Bearer "+key } });
const order = (status: string, id = "order") => ({ id, status, startsAt: new Date(Date.now()-1000), endsAt: new Date(Date.now()+60000), slots: ["video_ad:1"], currentArtwork: null, quote: { website: { id: site }, attachments: [{ slot: "video_ad:1", fileId: "22222222-2222-4222-8222-222222222222", targetUrl: "https://advertiser.example" }] }, customer: { email: "private@example.org" } });
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("ADS_PLUGIN_KEYS", JSON.stringify({[site]: "a".repeat(48)})); mock.rate.mockResolvedValue({ success: true }); mock.find.mockResolvedValue([]); });
afterEach(() => vi.unstubAllEnvs());
describe("WordPress ads feed", () => {
  it("rejects invalid keys before database access", async () => { expect((await GET(request("wrong"))).status).toBe(401); expect(mock.find).not.toHaveBeenCalled(); });
  it("exposes reservations without serving unpaid artwork", async () => {
    mock.find.mockResolvedValue([order("PAYMENT")]);
    const data = await (await GET(request())).json();
    expect(data.slots.find((s: { id: string }) => s.id === "video_ad:1")).toMatchObject({ locked: true, state: "reserved", media: null });
    expect(JSON.stringify(data)).not.toContain("private@example.org");
  });
  it("serves the current contract while a renewal is scheduled", async () => {
    mock.find.mockResolvedValue([order("ACTIVE"), {...order("SCHEDULED", "renewal"), startsAt: new Date(Date.now()+60000)}]);
    const data = await (await GET(request())).json();
    expect(data.slots.find((s: { id: string }) => s.id === "video_ad:1").state).toBe("active");
  });
  it("hides conflicting active ads instead of stacking", async () => {
    mock.find.mockResolvedValue([order("ACTIVE"), order("ACTIVE", "duplicate")]);
    const data = await (await GET(request())).json();
    expect(data.slots.find((s: { id: string }) => s.id === "video_ad:1")).toMatchObject({ locked: true, state: "conflict", media: null });
  });
  it("does not expose another website's placements", async () => {
    mock.find.mockResolvedValue([{...order("ACTIVE"), quote: { website: { id: "other" } }}]);
    const data = await (await GET(request())).json();
    expect(data.slots.every((s: { locked: boolean }) => !s.locked)).toBe(true);
  });
});
