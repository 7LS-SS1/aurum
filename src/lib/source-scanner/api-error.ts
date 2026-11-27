import { Prisma } from "@prisma/client";
import { apiError, ApiError } from "@/lib/api-response";

export function scannerApiError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const missingModel = ((error.code === "P2021" || error.code === "P2022") && /video_sources|source_items|source_pages|source_events|scanner_leases|scanner_worker_status/i.test(error.message));
    const missingSqlObject = error.code === "P2010" && ["42P01", "42703"].includes(String(error.meta?.code)) && /video_sources|source_items|source_pages|source_events|scanner_leases|scanner_worker_status/i.test(error.message);
    const missingAutoEnum = (error.code === "P2006" || error.code === "P2007" || error.code === "P2023") && /SourceAdapter/i.test(error.message) && /\bAUTO\b/.test(error.message);

    if (missingModel || missingSqlObject || missingAutoEnum) {
      console.error("Scanner database migration required", { prismaCode: error.code });
      return apiError(new ApiError("SCANNER_MIGRATION_REQUIRED: ฐานข้อมูลของระบบสแกนยังไม่พร้อม กรุณาให้ผู้ดูแลติดตั้ง migration ของ Video Source Scanner", 503));
    }
  }
  return apiError(error);
}
