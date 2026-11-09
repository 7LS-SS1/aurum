import { afterAll, describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import { createClient } from "redis";
import { NextRequest } from "next/server";
import { ApiError } from "@/lib/api-response";
vi.mock("@/lib/authz", () => ({
  requireMinRole: vi.fn(async () => ({ id: "test", role: "MANAGER" })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    targetSite: {
      findMany: vi.fn(async () => [
        {
          id: "site-a",
          name: "Fixture",
          baseUrl: "https://example.invalid",
          isActive: true,
        },
      ]),
    },
  },
}));
import { requireMinRole } from "@/lib/authz";
import { POST } from "@/app/api/monitor/ingest/route";
import { GET } from "@/app/api/monitor/route";
import { saveSample, histories } from "./store";
import { sourceSchema, type Sample } from "./types";
const url = process.env.MONITOR_INTEGRATION_REDIS;
const token = "integration-only-not-a-production-secret-123456";
const source = sourceSchema.parse({
  id: "fixture-monitor-integration",
  label: "Fixture",
  scope: "host",
  siteIds: ["site-a"],
  tokenHash: createHash("sha256").update(token).digest("hex"),
});
const source2 = { ...source, id: source.id + "-history" };
function sample(time: number, cpu = 95): Sample {
  return {
    timestamp: new Date(time).toISOString(),
    cpuPercent: cpu,
    memoryUsed: 900,
    memoryTotal: 1000,
    diskUsed: 100,
    diskTotal: 1000,
    rxBytesPerSecond: 12,
    txBytesPerSecond: 25,
    rxBytes: 1200,
    txBytes: 2500,
  };
}
function request(body: unknown, secret = token) {
  return new NextRequest("https://example.invalid/api/monitor/ingest", {
    method: "POST",
    headers: {
      authorization: "Bearer " + secret,
      "x-monitor-source": source.id,
    },
    body: JSON.stringify(body),
  });
}
describe.skipIf(!url)("monitor actual Redis + HTTP handlers", () => {
  it("runs protected ingestion, snapshots and bounded persistent alert state", async () => {
    if (!url?.startsWith("redis://127.0.0.1:"))
      throw Error("Local isolated Redis required");
    process.env.MONITOR_REDIS_URL = url;
    process.env.MONITOR_SOURCES_JSON = JSON.stringify([source]);
    const cleanup = createClient({ url });
    await cleanup.connect();
    await cleanup.del([
      `aurum:monitor:v1:${source.id}`,
      `aurum:monitor:v1:${source2.id}`,
    ]);
    await cleanup.quit();
    expect((await POST(request(sample(Date.now()), "wrong"))).status).toBe(401);
    expect(
      (await POST(request({ ...sample(Date.now()), diskTotal: -1 }))).status,
    ).toBe(422);
    expect((await POST(request(sample(Date.now() - 9999999)))).status).toBe(
      422,
    );
    expect((await POST(request({ padding: "x".repeat(5000) }))).status).toBe(
      413,
    );
    const start = Date.now() - 45000;
    for (let i = 0; i < 3; i++)
      expect((await POST(request(sample(start + i * 15000)))).status).toBe(200);
    expect(await (await POST(request(sample(start + 30000)))).json()).toEqual({
      accepted: false,
    });
    const snapshot = await (
      await GET(new Request("https://example.invalid/api/monitor"))
    ).json();
    expect(
      snapshot.rows[0].alerts.some(
        (a: { metric: string; status: string }) =>
          a.metric === "cpu" && a.status === "active",
      ),
    ).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain(source.tokenHash);
    expect(snapshot.sites[0].id).toBe("site-a");
    const summary = await (
      await GET(new Request("https://example.invalid/api/monitor?summary=1"))
    ).json();
    expect(summary.rows[0].history).toEqual([]);
    for (let i = 0; i < 130; i++)
      await saveSample(source2, sample(start + i * 15000, i < 3 ? 95 : 82));
    let state = (await histories([source2.id]))[0]!;
    expect(state.history).toHaveLength(120);
    expect(state.trackers.cpu?.alert?.status).toBe("active");
    await saveSample(source2, sample(start + 130 * 15000, 50));
    await saveSample(source2, sample(start + 131 * 15000, 50));
    state = (await histories([source2.id]))[0]!;
    expect(state.trackers.cpu?.alert?.status).toBe("recovered");
    vi.mocked(requireMinRole).mockRejectedValueOnce(
      new ApiError("forbidden", 403),
    );
    expect(
      (await GET(new Request("https://example.invalid/api/monitor"))).status,
    ).toBe(403);
  }, 20000);
});
afterAll(async () => {
  if (url?.startsWith("redis://127.0.0.1:")) {
    const c = createClient({ url });
    await c.connect();
    await c.del([
      `aurum:monitor:v1:${source.id}`,
      `aurum:monitor:v1:${source2.id}`,
    ]);
    await c.quit();
  }
});
