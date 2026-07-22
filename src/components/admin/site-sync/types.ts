export type SyncJobStatus = "QUEUED" | "SCANNING" | "PROCESSING" | "COMPLETED" | "PARTIAL" | "FAILED" | "CANCELLED";
export type SyncLogLevel = "INFO" | "WARN" | "ERROR";

export interface PublicSyncJob {
  id: string;
  siteId: string;
  requestedById: string | null;
  status: SyncJobStatus;
  phase: string;
  totalMovies: number;
  scannedMovies: number;
  matchedMovies: number;
  skippedMovies: number;
  queuedMovies: number;
  processedMovies: number;
  successCount: number;
  failedCount: number;
  progress: number;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  heartbeatAt: string | null;
  createdAt: string;
  updatedAt: string;
  site?: { id: string; name: string };
}

export interface SyncJobLog {
  id: string;
  jobId: string;
  level: SyncLogLevel;
  event: string;
  message: string;
  movieId: string | null;
  remotePostId: string | null;
  remotePostUrl: string | null;
  metadata: unknown;
  createdAt: string;
}

export const ACTIVE_SYNC_STATUSES: SyncJobStatus[] = ["QUEUED", "SCANNING", "PROCESSING"];

export function isActiveSyncStatus(status: SyncJobStatus): boolean {
  return ACTIVE_SYNC_STATUSES.includes(status);
}

const PHASE_LABEL_TH: Record<string, string> = {
  queued: "รอเริ่ม",
  scanning: "กำลังตรวจสอบโพสต์บนเว็บไซต์",
  comparing: "กำลังเปรียบเทียบวิดีโอ",
  pushing: "กำลังส่งวิดีโอ",
  completed: "สำเร็จ",
  partial: "สำเร็จบางส่วน",
  failed: "ล้มเหลว",
  cancelled: "ยกเลิกแล้ว",
};

export function phaseLabelTh(phase: string): string {
  return PHASE_LABEL_TH[phase] ?? phase;
}

export function statusBadgeClass(status: SyncJobStatus): "ok" | "warn" | "bad" | "neutral" | "gold" {
  switch (status) {
    case "COMPLETED":
      return "ok";
    case "PARTIAL":
      return "warn";
    case "FAILED":
      return "bad";
    case "CANCELLED":
      return "neutral";
    default:
      return "gold";
  }
}
