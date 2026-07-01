import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { encrypt } from "../src/lib/crypto";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("ChangeMe123!", 12);
  await prisma.user.upsert({
    where: { email: "admin@aurum.local" },
    update: {},
    create: { email: "admin@aurum.local", passwordHash, name: "Admin", role: "ADMIN" },
  });

  const demoCred = encrypt("demo-app-password-0000-0000-0000");
  const site = await prisma.targetSite.upsert({
    where: { id: "seed-site-demo" },
    update: {},
    create: {
      id: "seed-site-demo",
      name: "Demo WP Site",
      baseUrl: "https://demo.example.com",
      wpUsername: "editor",
      credentialEnc: demoCred.ciphertext,
      credentialIv: demoCred.iv,
      credentialTag: demoCred.tag,
      postType: "posts",
      healthStatus: "UNKNOWN",
    },
  });

  await prisma.movie.upsert({
    where: { id: "seed-movie-demo" },
    update: {},
    create: {
      id: "seed-movie-demo",
      title: "ตัวอย่างเรื่องทดสอบ",
      slug: "demo-title",
      excerpt: "เนื้อเรื่องย่อสำหรับทดสอบ Product Test",
      mainCategory: "หนัง",
      categories: ["ดราม่า"],
      tags: ["2026", "HD"],
      thumbnailUrl: null,
      videoUrl: "https://example.com/demo.m3u8",
      videoProvider: "bunny",
      status: "DRAFT",
    },
  });

  console.log("Seed complete:", { site: site.name });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
