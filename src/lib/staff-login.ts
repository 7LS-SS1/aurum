import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "./prisma";
import { clientIp, rateLimit } from "./rate-limit";

const credentials = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(1024) });

export async function authenticateStaff(raw: unknown, request: Request) {
  // Apply the IP budget before parsing or doing expensive password hashing.
  if (!(await rateLimit(`staff-login:ip:${clientIp(request)}`, { limit: 10, windowMs: 300_000 })).success) return null;
  const parsed = credentials.safeParse(raw);
  if (!parsed.success) return null;
  const { email, password } = parsed.data;
  const account = createHash("sha256").update(email.toLowerCase()).digest("hex");
  if (!(await rateLimit(`staff-login:account:${account}`, { limit: 30, windowMs: 900_000 })).success) return null;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}
