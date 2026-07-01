import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "@/auth.config";

/**
 * Route protection lives here (not per-handler `if (!session)` checks) so a
 * new admin API route is protected by default just by matching the path —
 * forgetting the check in one handler can't silently expose it.
 *
 * Built from auth.config.ts (no Credentials/bcrypt/Prisma) because
 * middleware always runs on the Edge runtime — pulling the full auth.ts in
 * here would drag bcryptjs and the Prisma engine into an Edge bundle where
 * neither actually works.
 */
const { auth } = NextAuth(authConfig);

const PUBLIC_API_PREFIXES = ["/api/auth", "/api/health", "/api/public"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  const isPublicApi = PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));
  const isAdminArea = pathname.startsWith("/admin") && pathname !== "/admin/login";
  const isProtectedApi = pathname.startsWith("/api") && !isPublicApi;

  if ((isAdminArea || isProtectedApi) && !req.auth) {
    if (isProtectedApi) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/admin/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
