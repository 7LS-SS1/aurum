import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { WordPressClient } from "@/lib/wordpress-client";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";

/** Verifies a site's stored credential still works and updates its health_status. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireMinRole("MANAGER");
    const { id } = await params;

    const site = await prisma.targetSite.findUnique({ where: { id } });
    if (!site) throw new ApiError("site_not_found", 404);

    const client = new WordPressClient({
      baseUrl: site.baseUrl,
      authType: site.authType,
      username: site.wpUsername,
      credential: decrypt({ ciphertext: site.credentialEnc, iv: site.credentialIv, tag: site.credentialTag }),
    });

    let healthStatus: "OK" | "ERROR" = "OK";
    try {
      await client.ping();
    } catch {
      healthStatus = "ERROR";
    }

    await prisma.targetSite.update({
      where: { id },
      data: { healthStatus, lastCheckedAt: new Date() },
    });

    return jsonOk({ healthStatus });
  } catch (err) {
    return apiError(err);
  }
}
