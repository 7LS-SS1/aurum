import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-response";
import { aiProvider, type AiProvider } from "@/lib/ai-provider";

export async function readAiConfig(options: { requireStorage?: boolean; provider?: AiProvider } = {}) {
  if (!prisma.contentAiConfig) {
    throw new ApiError("ระบบยังใช้ Prisma Client รุ่นเก่า กรุณารัน npx prisma generate แล้วเริ่มเซิร์ฟเวอร์ใหม่", 503);
  }
  try {
    const config = await prisma.contentAiConfig.findUnique({ where: { id: options.provider ? `provider:${options.provider}` : "default" } });
    if (config) {
      const provider = aiProvider(config.provider);
      if (options.provider && provider !== options.provider) throw new ApiError("ข้อมูลผู้ให้บริการ AI ไม่ตรงกัน กรุณาบันทึกการตั้งค่าใหม่", 503);
    }
    return config;
  }
  catch (error) {
    // Older installations continue distributing normally until the migration is applied.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
      if (options.requireStorage) throw new ApiError("ยังไม่มีตารางตั้งค่า AI กรุณารัน npx prisma migrate deploy แล้วลองอีกครั้ง", 503);
      return null;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
      throw new ApiError("โครงสร้างตาราง AI ยังไม่ตรงกับแอป กรุณารัน npx prisma migrate deploy", 503);
    }
    throw error;
  }
}
