import { auth } from "@/auth";
import { ApiError } from "@/lib/api-response";

export type Role = "ADMIN" | "EDITOR";

/**
 * Session presence is already enforced by middleware.ts — this adds the
 * finer-grained role check for routes that touch site credentials, which
 * only ADMIN should be able to manage.
 */
export async function requireRole(...allowed: Role[]) {
  const session = await auth();
  if (!session?.user) throw new ApiError("unauthorized", 401);
  if (!allowed.includes(session.user.role)) throw new ApiError("forbidden", 403);
  return session.user;
}
