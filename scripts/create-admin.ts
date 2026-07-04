/**
 * Creates (or resets the password of) a HEAD-role admin account.
 *
 * Run it yourself, locally or via `docker exec`/Coolify's terminal against
 * the production DATABASE_URL — never paste a real production password into
 * chat with an assistant. Usage:
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='replace-with-your-own-real-password' ADMIN_NAME='Your Name' npm run admin:create
 *
 * Safe to re-run: upserts by email, so running it again with a new
 * ADMIN_PASSWORD is also how you rotate an existing admin's password.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || "Admin";

  if (!email || !password) {
    console.error("Usage: ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' [ADMIN_NAME='...'] npm run admin:create");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("ADMIN_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, name, role: "HEAD" },
    create: { email, passwordHash, name, role: "HEAD" },
  });

  console.log(`OK — HEAD admin ready: ${user.email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
