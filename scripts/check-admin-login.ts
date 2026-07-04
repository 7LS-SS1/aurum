/**
 * Diagnoses admin login from the current runtime environment without printing
 * secrets or password hashes.
 *
 * Usage:
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='your-password' npm run admin:check-login
 *
 * Run this in the same place the app runs (local terminal or Coolify terminal)
 * to confirm whether that runtime can see AUTH_SECRET, DATABASE_URL, the user,
 * role, and a matching bcrypt password hash.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function maskUrlHost(raw: string | undefined) {
  if (!raw) return "missing";
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}${url.pathname}`;
  } catch {
    return "set-but-not-a-valid-url";
  }
}

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;

  console.log(`AUTH_SECRET: ${process.env.AUTH_SECRET ? `set (${process.env.AUTH_SECRET.length} chars)` : "missing"}`);
  console.log(`AUTH_URL: ${process.env.AUTH_URL || "missing"}`);
  console.log(`DATABASE_URL host: ${maskUrlHost(process.env.DATABASE_URL)}`);

  if (!email || !password) {
    console.error("Usage: ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' npm run admin:check-login");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { email: true, name: true, role: true, passwordHash: true, updatedAt: true },
  });

  if (!user) {
    console.log("USER: not found");
    process.exit(2);
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  console.log(`USER: found (${user.email})`);
  console.log(`NAME: ${user.name ?? "-"}`);
  console.log(`ROLE: ${user.role}`);
  console.log(`UPDATED_AT: ${user.updatedAt.toISOString()}`);
  console.log(`PASSWORD_MATCH: ${passwordMatches ? "yes" : "no"}`);

  if (user.role === "SYSTEM") {
    console.log("WARNING: SYSTEM is for automation and should not be used for interactive admin login.");
  }

  process.exit(passwordMatches ? 0 : 3);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
