const REDISTRIBUTABLE_STATUSES = new Set(["APPROVED", "PARTIAL", "FAILED", "DONE"]);
const DRAFT_BYPASS_ROLES = new Set(["MANAGER", "HEAD"]);

/**
 * A completed movie may be distributed again to refresh its video metadata.
 * Draft publication remains an explicit manager/head privilege.
 */
export function canDistributeMovie(status: string, role: string): boolean {
  return REDISTRIBUTABLE_STATUSES.has(status) || (status === "DRAFT" && DRAFT_BYPASS_ROLES.has(role));
}
