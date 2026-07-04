/**
 * Pure permission rules — no server-only imports, safe to use from client
 * components (to hide/disable buttons) as well as API routes (to reject
 * requests). This is the single source of truth for "who can do what";
 * nothing else should hardcode a role check against an action.
 */
export type Role = "STAFF" | "SENIOR" | "MANAGER" | "HEAD" | "SYSTEM";

export const ROLE_LABEL_TH: Record<Role, string> = {
  STAFF: "เจ้าหน้าที่",
  SENIOR: "ซีเนียร์",
  MANAGER: "ผู้จัดการ",
  HEAD: "หัวหน้าฝ่าย",
  SYSTEM: "ระบบอัตโนมัติ",
};

/** SYSTEM is a separate automation identity, not part of the human hierarchy. */
export const ROLE_RANK: Record<Exclude<Role, "SYSTEM">, number> = {
  STAFF: 1,
  SENIOR: 2,
  MANAGER: 3,
  HEAD: 4,
};

export type Action =
  | "movie:view"
  | "movie:create"
  | "movie:edit"
  | "movie:submit-review"
  | "movie:review"
  | "movie:reject"
  | "movie:approve"
  | "movie:publish"
  | "movie:archive"
  | "movie:delete"
  | "site:view"
  | "site:manage"
  | "site:delete"
  | "player:view"
  | "player:manage"
  | "player:delete"
  | "audit:view"
  | "upload:quick-publish";

const MIN_ROLE: Record<Action, Exclude<Role, "SYSTEM">> = {
  "movie:view": "STAFF",
  "movie:create": "STAFF",
  "movie:edit": "STAFF",
  "movie:submit-review": "STAFF",
  "movie:review": "SENIOR",
  "movie:reject": "SENIOR",
  "movie:approve": "MANAGER",
  "movie:publish": "MANAGER",
  "movie:archive": "MANAGER",
  "movie:delete": "HEAD",
  "site:view": "STAFF",
  "site:manage": "MANAGER",
  "site:delete": "HEAD",
  "player:view": "STAFF",
  "player:manage": "MANAGER",
  "player:delete": "HEAD",
  "audit:view": "HEAD",
  "upload:quick-publish": "MANAGER",
};

/** True if `role` has at least the minimum rank required for `action`. SYSTEM never passes human-role checks. */
export function can(role: Role, action: Action): boolean {
  if (role === "SYSTEM") return false;
  return ROLE_RANK[role] >= ROLE_RANK[MIN_ROLE[action]];
}

export function hasMinRole(role: Role, min: Exclude<Role, "SYSTEM">): boolean {
  if (role === "SYSTEM") return false;
  return ROLE_RANK[role] >= ROLE_RANK[min];
}
