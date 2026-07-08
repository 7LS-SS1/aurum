/**
 * One-off/idempotent seeding of the default Category list (the checkbox
 * options in the video upload wizard). Safe to re-run — skips names that
 * already exist. Usage:
 *
 *   npm run categories:seed
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_CATEGORIES = [
  "JAV",
  "NTR",
  "Onlyfans",
  "av",
  "คลิปหลุดVK",
  "คลิปหลุดมาใหม่",
  "คลิปหลุดไทย",
  "คลิปเสียว",
  "ความอัปยศ",
  "คำพูดสกปรก",
  "ขึ้นเดียว",
  "ดารา",
  "ทางบ้าน",
  "นวด",
  "นักแสดงชายผิวดำ",
  "ผลงานเดี่ยว",
  "สำส่อน",
  "หนังโป๊ไทย",
  "หน้าอกสวย",
  "หน้าอกใหญ่",
  "เอ็ม แมน",
  "แตกใน",
  "ใช้มือ",
  "ไม่เซ็นเซอร์",
];

async function main() {
  const result = await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((name) => ({ name })),
    skipDuplicates: true,
  });
  console.log(`OK — ${result.count} new categories created (${DEFAULT_CATEGORIES.length - result.count} already existed).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
