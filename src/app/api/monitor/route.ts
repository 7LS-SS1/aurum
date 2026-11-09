import { requireMinRole } from "@/lib/authz";
import { apiError, jsonOk } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { sources } from "@/lib/monitor/config";
import { histories, storageConfigured } from "@/lib/monitor/store";
import { currentAlerts, type MonitorSnapshot } from "@/lib/monitor/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    await requireMinRole("MANAGER");
    const configs = sources(),
      ready = storageConfigured();
    const [samples, sites] = await Promise.all([
      ready
        ? histories(configs.map((s) => s.id))
        : Promise.resolve(
            configs.map(() => ({ history: [], trackers: {}, policy: "" })),
          ),
      prisma.targetSite.findMany({
        select: { id: true, name: true, baseUrl: true, isActive: true },
        orderBy: { name: "asc" },
      }),
    ]);
    const now = Date.now();
    const result: MonitorSnapshot = {
      generatedAt: new Date(now).toISOString(),
      storageReady: ready,
      sites,
      rows: configs.map(({ tokenHash: _, ...source }, i) => {
        void _;
        const record = samples[i] ?? { history: [], trackers: {} };
        const history = record.history,
          alerts = currentAlerts(source, record.trackers, history.at(-1), now);
        return {
          source,
          history,
          alerts,
          state: !history.length
            ? "unconnected"
            : alerts.some((a) => a.metric === "offline")
              ? "stale"
              : "live",
        };
      }),
    };
    if (new URL(req.url).searchParams.get("summary") === "1")
      result.rows = result.rows.map((row) => ({ ...row, history: [] }));
    return jsonOk(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
