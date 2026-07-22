"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { isActiveSyncStatus, type PublicSyncJob, type SyncJobLog } from "./types";

const POLL_MS = 3000;
const LOG_PAGE_SIZE = 50;

interface SiteRef {
  id: string;
  name: string;
}

export interface SiteSyncJobsState {
  jobsBySite: Record<string, PublicSyncJob | undefined>;
  logsByJob: Record<string, SyncJobLog[]>;
  expandedSiteId: string | null;
  toastDismissed: Record<string, boolean>;
  errorsBySite: Record<string, string | undefined>;
  startSync: (siteId: string) => Promise<void>;
  startSyncMany: (siteIds: string[]) => Promise<void>;
  cancelSync: (siteId: string) => Promise<void>;
  retrySync: (siteId: string) => Promise<void>;
  toggleLogPanel: (siteId: string) => void;
  dismissToast: (siteId: string) => void;
}

/**
 * Owns every bit of client-side state for old-video-sync: which job is
 * active/most-recent per site, its incrementally-fetched logs, and the
 * persistent toast stack — kept out of SitesManager.tsx (and separately
 * testable) since it's the part of this feature with real logic in it.
 * Everything here is a read/refresh of server state, never the source of
 * truth itself — a page refresh just re-runs the mount effect below and
 * picks the in-progress job back up from the database.
 */
export function useSiteSyncJobs(sites: SiteRef[]): SiteSyncJobsState {
  const [jobsBySite, setJobsBySite] = useState<Record<string, PublicSyncJob | undefined>>({});
  const [logsByJob, setLogsByJob] = useState<Record<string, SyncJobLog[]>>({});
  const [expandedSiteId, setExpandedSiteId] = useState<string | null>(null);
  const [toastDismissed, setToastDismissed] = useState<Record<string, boolean>>({});
  const [errorsBySite, setErrorsBySite] = useState<Record<string, string | undefined>>({});

  const sitesRef = useRef(sites);
  sitesRef.current = sites;
  const lastLogIdByJob = useRef<Record<string, string | undefined>>({});
  const pollingRef = useRef(false);
  const autoDismissScheduled = useRef<Set<string>>(new Set());

  const applyJob = useCallback((job: PublicSyncJob) => {
    setJobsBySite((prev) => ({ ...prev, [job.siteId]: job }));
    if (isActiveSyncStatus(job.status)) {
      setToastDismissed((prev) => (prev[job.id] ? prev : { ...prev, [job.id]: false }));
    }
  }, []);

  // Restore state on mount/refresh: active jobs first (covers "still running
  // after I reloaded the page"), then each site's most recent job so a sync
  // that finished moments before the refresh still shows its final result.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const active = await apiFetch<{ jobs: PublicSyncJob[] }>("/api/sites/sync-jobs");
        if (cancelled) return;
        const activeSiteIds = new Set(active.jobs.map((j) => j.siteId));
        for (const job of active.jobs) applyJob(job);

        const remaining = sitesRef.current.filter((s) => !activeSiteIds.has(s.id));
        const recents = await Promise.all(
          remaining.map(async (site) => {
            try {
              const res = await apiFetch<{ jobs: PublicSyncJob[] }>(`/api/sites/${site.id}/sync-existing`);
              return res.jobs[0];
            } catch {
              return undefined;
            }
          }),
        );
        if (cancelled) return;
        for (const job of recents) if (job) applyJob(job);
      } catch {
        // Best-effort restore only — the sync buttons still work without it.
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only ever re-run this restore pass for a genuinely new site list, not on every jobsBySite update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites.map((s) => s.id).join(","), applyJob]);

  const fetchJobDetail = useCallback(async (jobId: string) => {
    const afterId = lastLogIdByJob.current[jobId];
    const params = new URLSearchParams({ limit: String(LOG_PAGE_SIZE) });
    if (afterId) params.set("afterId", afterId);
    const res = await apiFetch<{ job: PublicSyncJob; logs: SyncJobLog[] }>(`/api/sites/sync-jobs/${jobId}?${params.toString()}`);
    applyJob(res.job);
    if (res.logs.length > 0) {
      lastLogIdByJob.current[jobId] = res.logs[res.logs.length - 1]?.id;
      setLogsByJob((prev) => ({ ...prev, [jobId]: [...(prev[jobId] ?? []), ...res.logs] }));
    }
  }, [applyJob]);

  // Poll only while at least one job is still in flight; the interval is
  // torn down and re-created whenever that set of active job ids changes.
  useEffect(() => {
    const activeJobIds = Object.values(jobsBySite)
      .filter((job): job is PublicSyncJob => !!job && isActiveSyncStatus(job.status))
      .map((job) => job.id);
    if (activeJobIds.length === 0) return;

    const interval = setInterval(async () => {
      if (pollingRef.current) return;
      pollingRef.current = true;
      try {
        await Promise.all(activeJobIds.map((jobId) => fetchJobDetail(jobId)));
      } catch {
        // A transient poll failure just gets retried on the next tick.
      } finally {
        pollingRef.current = false;
      }
    }, POLL_MS);

    return () => clearInterval(interval);
  }, [jobsBySite, fetchJobDetail]);

  // Finished jobs' toasts close themselves after a while so the stack doesn't
  // pile up forever — but only once, and the user can still close it sooner.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const job of Object.values(jobsBySite)) {
      if (!job || isActiveSyncStatus(job.status)) continue;
      if (autoDismissScheduled.current.has(job.id)) continue;
      autoDismissScheduled.current.add(job.id);
      timers.push(
        setTimeout(() => {
          setToastDismissed((prev) => (prev[job.id] ? prev : { ...prev, [job.id]: true }));
        }, 10_000),
      );
    }
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [jobsBySite]);

  const startSync = useCallback(
    async (siteId: string) => {
      setErrorsBySite((prev) => ({ ...prev, [siteId]: undefined }));
      try {
        const res = await apiFetch<{ created: boolean; job: PublicSyncJob }>(`/api/sites/${siteId}/sync-existing`, { method: "POST" });
        applyJob(res.job);
        setExpandedSiteId(siteId);
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 409) return;
        setErrorsBySite((prev) => ({ ...prev, [siteId]: err instanceof ApiClientError ? err.message : "เริ่มซิงก์ไม่สำเร็จ" }));
      }
    },
    [applyJob],
  );

  const startSyncMany = useCallback(
    async (siteIds: string[]) => {
      try {
        const res = await apiFetch<{ results: { siteId: string; siteName: string; created: boolean; job: PublicSyncJob }[] }>(
          "/api/sites/sync-jobs",
          { method: "POST", body: JSON.stringify({ siteIds }) },
        );
        for (const r of res.results) applyJob(r.job);
      } catch (err) {
        const message = err instanceof ApiClientError ? err.message : "เริ่มซิงก์หลายเว็บไม่สำเร็จ";
        setErrorsBySite((prev) => {
          const next = { ...prev };
          for (const siteId of siteIds) next[siteId] = message;
          return next;
        });
      }
    },
    [applyJob],
  );

  const cancelSync = useCallback(
    async (siteId: string) => {
      const job = jobsBySite[siteId];
      if (!job) return;
      try {
        const res = await apiFetch<{ job: PublicSyncJob }>(`/api/sites/sync-jobs/${job.id}/cancel`, { method: "POST" });
        applyJob(res.job);
      } catch (err) {
        setErrorsBySite((prev) => ({ ...prev, [siteId]: err instanceof ApiClientError ? err.message : "ยกเลิกไม่สำเร็จ" }));
      }
    },
    [jobsBySite, applyJob],
  );

  const retrySync = useCallback(
    async (siteId: string) => {
      const job = jobsBySite[siteId];
      if (!job) return;
      try {
        const res = await apiFetch<{ created: boolean; job: PublicSyncJob }>(`/api/sites/sync-jobs/${job.id}/retry`, { method: "POST" });
        applyJob(res.job);
        setExpandedSiteId(siteId);
      } catch (err) {
        setErrorsBySite((prev) => ({ ...prev, [siteId]: err instanceof ApiClientError ? err.message : "ลองใหม่ไม่สำเร็จ" }));
      }
    },
    [jobsBySite, applyJob],
  );

  const toggleLogPanel = useCallback((siteId: string) => {
    setExpandedSiteId((prev) => (prev === siteId ? null : siteId));
  }, []);

  const dismissToast = useCallback((siteId: string) => {
    const job = jobsBySite[siteId];
    if (!job) return;
    setToastDismissed((prev) => ({ ...prev, [job.id]: true }));
  }, [jobsBySite]);

  return {
    jobsBySite,
    logsByJob,
    expandedSiteId,
    toastDismissed,
    errorsBySite,
    startSync,
    startSyncMany,
    cancelSync,
    retrySync,
    toggleLogPanel,
    dismissToast,
  };
}
