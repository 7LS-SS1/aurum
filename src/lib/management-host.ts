/** Fixed deployment configuration only: never derive redirect destinations from request headers. */
export function managementOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash ? url.origin : null; } catch { return null; }
}
export function managementRoute(url: URL, config: { enabled: boolean; origin?: string; publicOrigin?: string }, method = "GET") {
  const origin = managementOrigin(config.origin);
  if (!config.enabled || !origin) return { kind: "next" as const, pathname: url.pathname };
  const onManagement = url.origin === origin;
  const publicOrigin = managementOrigin(config.publicOrigin);
  const admin = url.pathname === "/admin" || url.pathname.startsWith("/admin/");
  if (!onManagement && url.origin === publicOrigin && admin) {
    // Never forward a credential-bearing POST across origins.
    if (!["GET", "HEAD"].includes(method)) return { kind: "reject" as const, pathname: url.pathname };
    const target = new URL(url.pathname === "/admin" ? "/" : url.pathname, origin);
    target.search = url.search;
    return { kind: "redirect" as const, pathname: url.pathname, target: target.href };
  }
  if (onManagement && url.pathname === "/") return { kind: "rewrite" as const, pathname: "/admin" };
  return { kind: "next" as const, pathname: url.pathname };
}
