export type UploadFailurePhase = "upload" | "validation" | "save" | "publish";

export interface UploadQueueValidationItem {
  status: string;
  videoUrl: string;
  title: string;
  thumbnailUrl: string;
  thumbProgress: number | null;
  previewProgress: number | null;
  error?: string;
  errorPhase?: UploadFailurePhase;
  thumbError?: string;
  previewError?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  internal_server_error: "เซิร์ฟเวอร์เกิดข้อผิดพลาด",
  invalid_credentials: "ข้อมูลเข้าสู่ระบบไม่ถูกต้อง",
  too_many_requests: "มีคำขอมากเกินไป กรุณารอสักครู่แล้วลองใหม่",
  unauthorized: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่",
  forbidden: "บัญชีนี้ไม่มีสิทธิ์ดำเนินการ",
};

export function formatUploadError(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const raw = error.message.trim();
    const friendly = ERROR_MESSAGES[raw] ?? raw;
    const status = "status" in error && typeof error.status === "number" ? `HTTP ${error.status}: ` : "";
    return `${fallback} — ${status}${friendly || "ไม่ทราบสาเหตุ"}`;
  }
  return `${fallback} — ไม่ทราบสาเหตุ`;
}

export function failurePhaseLabel(phase?: UploadFailurePhase): string {
  switch (phase) {
    case "upload":
      return "อัปโหลดไฟล์";
    case "validation":
      return "ตรวจสอบข้อมูล";
    case "save":
      return "บันทึกข้อมูล";
    case "publish":
      return "เผยแพร่";
    default:
      return "ประมวลผล";
  }
}

export function retryActionLabel(phase?: UploadFailurePhase): string {
  return phase === "upload" ? "ลองอัปโหลดใหม่" : phase === "validation" ? "กลับไปแก้ข้อมูล" : "ลองประมวลผลใหม่";
}

export function validateUploadQueueItem(item: UploadQueueValidationItem): string[] {
  const issues: string[] = [];

  if (item.status === "uploading" || item.status === "queued") {
    issues.push("วิดีโอหลักยังอัปโหลดไม่เสร็จ");
  } else if (item.errorPhase === "upload" && item.error) {
    issues.push(item.error);
  } else if (!item.videoUrl) {
    issues.push("วิดีโอหลักยังอัปโหลดไม่สำเร็จ");
  }

  if (!item.title.trim()) issues.push("ยังไม่ได้กรอกชื่อเรื่อง");
  if (item.thumbProgress !== null) issues.push("รูปหน้าปกยังอัปโหลดไม่เสร็จ");
  if (item.thumbError) issues.push(item.thumbError);
  if (!item.thumbnailUrl) issues.push("ยังไม่ได้อัปโหลดรูปหน้าปก");
  if (item.previewProgress !== null) issues.push("วิดีโอพรีวิวยังอัปโหลดไม่เสร็จ");
  if (item.previewError) issues.push(item.previewError);

  return [...new Set(issues)];
}

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  ".avif": "image/avif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".m2ts": "video/mp2t",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".ts": "video/mp2t",
  ".webm": "video/webm",
  ".webp": "image/webp",
};

/** Browsers on Windows often leave File.type empty for valid video files. */
export function resolveUploadContentType(file: { name: string; type: string }): string {
  const declared = file.type.trim().toLowerCase();
  if (declared) return declared;
  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  return CONTENT_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream";
}
