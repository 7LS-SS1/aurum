import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { WordPressClient } from "@/lib/wordpress-client";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import type { WordPressIntegrationHealth } from "@/lib/wordpress-integration-health";

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
      postType: site.postType,
      categoryRestBase: site.categoryRestBase,
      tagRestBase: site.tagRestBase,
      credential: decrypt({ ciphertext: site.credentialEnc, iv: site.credentialIv, tag: site.credentialTag }),
    });

    let healthStatus: "OK" | "ERROR" = "OK";
    let integration: WordPressIntegrationHealth | null = null;
    let message = "เชื่อมต่อและระบบวิดีโอพร้อมใช้งาน";
    try {
      await client.ping();
      integration = await client.integrationHealth();
      if (!integration.ready) {
        healthStatus = "ERROR";
        message = "เชื่อมต่อได้ แต่ " + integration.issues.join(" · ");
      }
    } catch {
      healthStatus = "ERROR";
      message = "ตรวจสอบไม่สำเร็จ — ตรวจสอบกุญแจ สิทธิ์ผู้ใช้ และการเปิดใช้ AURUM Video Core";
    }

    await prisma.targetSite.update({
      where: { id },
      data: { healthStatus, lastCheckedAt: new Date() },
    });

    return jsonOk({ healthStatus, integration, message });
  } catch (err) {
    return apiError(err);
  }
}
