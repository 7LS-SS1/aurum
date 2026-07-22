import { describe, it, expect } from "vitest";
import { buildToastEntries } from "./SiteSyncToastStack";
import type { PublicSyncJob } from "./types";

function job(overrides: Partial<PublicSyncJob> = {}): PublicSyncJob {
  return {
    id: "job-1",
    siteId: "site-1",
    requestedById: null,
    status: "PROCESSING",
    phase: "pushing",
    totalMovies: 10,
    scannedMovies: 10,
    matchedMovies: 2,
    skippedMovies: 2,
    queuedMovies: 8,
    processedMovies: 3,
    successCount: 3,
    failedCount: 0,
    progress: 55,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    heartbeatAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildToastEntries", () => {
  it("builds one entry per site with a resolved site name", () => {
    const entries = buildToastEntries({ "site-1": job() }, { "site-1": "Site One" }, {});
    expect(entries).toEqual([{ job: job(), siteName: "Site One" }]);
  });

  it("omits sites with no job at all", () => {
    const entries = buildToastEntries({ "site-1": undefined }, { "site-1": "Site One" }, {});
    expect(entries).toEqual([]);
  });

  it("omits a job once its id has been dismissed, active or not", () => {
    const active = job({ id: "job-active", status: "PROCESSING" });
    const finished = job({ id: "job-done", siteId: "site-2", status: "COMPLETED" });
    const entries = buildToastEntries(
      { "site-1": active, "site-2": finished },
      { "site-1": "Site One", "site-2": "Site Two" },
      { "job-active": true },
    );
    expect(entries).toEqual([{ job: finished, siteName: "Site Two" }]);
  });

  it("falls back to the job's embedded site name when no explicit name map entry exists", () => {
    const withEmbeddedSite = job({ site: { id: "site-9", name: "Embedded Site" } });
    const entries = buildToastEntries({ "site-9": withEmbeddedSite }, {}, {});
    expect(entries[0]?.siteName).toBe("Embedded Site");
  });
});
