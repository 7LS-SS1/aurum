import { auth } from "@/auth";
import { ApiError } from "@/lib/api-response";
import { env } from "@/lib/env";
import { ROLE_RANK, type Role } from "@/lib/permissions";

export type { Role };

export interface Actor {
  id: string | null;
  role: Role;
}

/**
 * Session presence is already enforced by middleware.ts — this adds the
 * finer-grained role check for routes that touch site/player credentials or
 * the review/approval workflow.
 */
export async function requireRole(...allowed: Role[]): Promise<Actor> {
  const session = await auth();
  if (!session?.user) throw new ApiError("unauthorized", 401);
  if (!allowed.includes(session.user.role)) throw new ApiError("forbidden", 403);
  return { id: session.user.id, role: session.user.role };
}

/** Hierarchical check — grants `min` and every role above it (SYSTEM never qualifies). */
export async function requireMinRole(min: Exclude<Role, "SYSTEM">): Promise<Actor> {
  const session = await auth();
  if (!session?.user) throw new ApiError("unauthorized", 401);
  const role = session.user.role;
  if (role === "SYSTEM" || ROLE_RANK[role] < ROLE_RANK[min]) throw new ApiError("forbidden", 403);
  return { id: session.user.id, role };
}

export async function requireAdmin(): Promise<Actor> {
  return requireRole("HEAD");
}

/** Validates the X-System-Key header for internal automation calls — SYSTEM never has a login session. */
export function requireSystemKey(req: Request): Actor {
  const configured = env().SYSTEM_API_KEY;
  const provided = req.headers.get("x-system-key");
  if (!configured || !provided || provided !== configured) {
    throw new ApiError("unauthorized", 401);
  }
  return { id: null, role: "SYSTEM" };
}

/**
 * For endpoints that must accept either a human session (checked against
 * `allowed`) or, when SYSTEM is in `allowed`, a valid X-System-Key header.
 */
export async function requireRoleOrSystem(req: Request, ...allowed: Role[]): Promise<Actor> {
  if (allowed.includes("SYSTEM")) {
    const configured = env().SYSTEM_API_KEY;
    const provided = req.headers.get("x-system-key");
    if (configured && provided && provided === configured) {
      return { id: null, role: "SYSTEM" };
    }
  }
  return requireRole(...allowed.filter((r) => r !== "SYSTEM"));
}
