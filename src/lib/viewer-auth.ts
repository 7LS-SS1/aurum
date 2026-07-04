import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-response";
import { clientIp } from "@/lib/rate-limit";

/**
 * Public viewer sessions are deliberately a separate, simpler system from
 * src/lib/authz.ts / NextAuth (staff-only, tied to the Role enum). A viewer
 * session token is 256 bits of real randomness, so a fast one-way hash is
 * enough to make a stolen DB row useless — unlike src/lib/crypto.ts's AES
 * envelope, which exists for secrets we must later decrypt back to plaintext.
 */
export const VIEWER_COOKIE_NAME = "aurum_viewer_session";
const COOKIE_NAME = VIEWER_COOKIE_NAME;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const REFRESH_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000; // refresh once under 15 days remaining

export interface ViewerActor {
  id: string;
  email: string;
  displayName: string;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export async function createViewerSession(viewerId: string, req: Request): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.viewerSession.create({
    data: {
      viewerId,
      tokenHash: hashToken(token),
      userAgent: req.headers.get("user-agent")?.slice(0, 255),
      ipAddress: clientIp(req),
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export function setViewerSessionCookie(res: NextResponse, token: string, expiresAt: Date): void {
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export function clearViewerSessionCookie(res: NextResponse): void {
  res.cookies.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

async function lookupViewerByToken(token: string | undefined): Promise<ViewerActor | null> {
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = await prisma.viewerSession.findUnique({
    where: { tokenHash },
    include: { viewer: { select: { id: true, email: true, displayName: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;

  // Best-effort sliding expiration — never block/fail the caller on this.
  const remainingMs = session.expiresAt.getTime() - Date.now();
  if (remainingMs < REFRESH_THRESHOLD_MS) {
    try {
      await prisma.viewerSession.update({
        where: { tokenHash },
        data: { expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
      });
    } catch {
      // non-fatal — the session just expires a bit sooner than ideal
    }
  }

  return session.viewer;
}

/** For API route handlers (has a NextRequest with a synchronous cookie jar). */
export async function getViewerFromRequest(req: NextRequest): Promise<ViewerActor | null> {
  return lookupViewerByToken(req.cookies.get(COOKIE_NAME)?.value);
}

export async function requireViewerFromRequest(req: NextRequest): Promise<ViewerActor> {
  const viewer = await getViewerFromRequest(req);
  if (!viewer) throw new ApiError("unauthorized", 401);
  return viewer;
}

/** For Server Components, which have no NextRequest — reads via next/headers instead. */
export async function getViewerFromCookies(): Promise<ViewerActor | null> {
  const jar = await cookies();
  return lookupViewerByToken(jar.get(COOKIE_NAME)?.value);
}

export async function deleteViewerSessionByToken(token: string | undefined): Promise<void> {
  if (!token) return;
  await prisma.viewerSession.deleteMany({ where: { tokenHash: hashToken(token) } });
}
