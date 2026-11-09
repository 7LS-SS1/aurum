import { prisma } from "../src/lib/prisma";
import { decrypt } from "../src/lib/crypto";

// GET-only production diagnostics. Never log credentials, response bodies or titles.
async function main() {
  const failures = await prisma.distribution.findMany({ where: { status: "FAILED" }, orderBy: { updatedAt: "desc" }, take: 12,
    select: { movieId: true, siteId: true, remotePostId: true, attempts: true, errorMessage: true, updatedAt: true } });
  console.log(JSON.stringify({ failures }));
  const sites = await prisma.targetSite.findMany({ where: { id: { in: [...new Set(failures.map(row => row.siteId))] } } });
  for (const site of sites) {
    const credential = decrypt({ ciphertext: site.credentialEnc, iv: site.credentialIv, tag: site.credentialTag });
    const authorization = site.authType === "JWT" ? `Bearer ${credential}` : `Basic ${Buffer.from(`${site.wpUsername}:${credential}`).toString("base64")}`;
    for (const route of ["/wp-json/wp/v2/users/me?context=edit", "/wp-json/aurum-video-core/v1/diagnostics", `/wp-json/wp/v2/${site.postType}?context=edit&status=any&per_page=1&_fields=id`]) {
      const start = Date.now();
      try {
        const response = await fetch(site.baseUrl.replace(/\/+$/, "") + route + (route.includes("?") ? "&" : "?") + "aurum_probe=" + Date.now(), { headers: { Authorization: authorization, "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(15000) });
        const body = await response.text();
        let code: string | undefined;
        try { const parsed = JSON.parse(body); if (typeof parsed.code === "string") code = parsed.code; } catch { /* HTML bodies are not logged */ }
        console.log(JSON.stringify({ host: new URL(site.baseUrl).hostname, route, status: response.status, code, ms: Date.now() - start, databaseError: /Error establishing a database connection/i.test(body), bytes: body.length }));
      } catch (error) { console.log(JSON.stringify({ host: new URL(site.baseUrl).hostname, route, error: error instanceof Error ? error.name : "unknown", ms: Date.now() - start })); }
    }
  }
}
main().catch(error => { console.error(error instanceof Error ? error.name : "diagnostic_failed"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
