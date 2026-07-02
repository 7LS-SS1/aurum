import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { encrypt } from "../src/lib/crypto";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("ChangeMe123!", 12);

  const head = await prisma.user.upsert({
    where: { email: "admin@aurum.local" },
    update: {},
    create: { email: "admin@aurum.local", passwordHash, name: "Head Admin", role: "HEAD" },
  });

  // Personal test login (HEAD access) — requested for manual QA of the admin system.
  const testerPasswordHash = await bcrypt.hash("zxcv3210", 12);
  await prisma.user.upsert({
    where: { email: "7ls@example.com" },
    update: { passwordHash: testerPasswordHash, role: "HEAD" },
    create: { email: "7ls@example.com", passwordHash: testerPasswordHash, name: "7ls", role: "HEAD" },
  });
  await prisma.user.upsert({
    where: { email: "manager@aurum.local" },
    update: {},
    create: { email: "manager@aurum.local", passwordHash, name: "Demo Manager", role: "MANAGER" },
  });
  await prisma.user.upsert({
    where: { email: "senior@aurum.local" },
    update: {},
    create: { email: "senior@aurum.local", passwordHash, name: "Demo Senior", role: "SENIOR" },
  });
  const staff = await prisma.user.upsert({
    where: { email: "staff@aurum.local" },
    update: {},
    create: { email: "staff@aurum.local", passwordHash, name: "Demo Staff", role: "STAFF" },
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
      createdById: staff.id,
    },
  });

  const demoKeyEnc = encrypt("demo-jwplayer-api-key-0000-0000");
  await prisma.playerConfig.upsert({
    where: { id: "seed-player-demo" },
    update: {},
    create: {
      id: "seed-player-demo",
      provider: "JWPLAYER",
      name: "Demo JWPlayer",
      playerId: "demo-player-id",
      libraryUrl: "https://cdn.jwplayer.com/libraries/demo-player-id.js",
      apiKeyEnc: demoKeyEnc.ciphertext,
      apiKeyIv: demoKeyEnc.iv,
      apiKeyTag: demoKeyEnc.tag,
      defaultPosterMode: "auto",
      isDefault: true,
      isActive: true,
    },
  });

  console.log("Seed complete:", { head: head.email, site: site.name });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
