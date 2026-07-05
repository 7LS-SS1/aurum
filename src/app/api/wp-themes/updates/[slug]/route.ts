import { prisma } from "@/lib/prisma";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const theme = await prisma.wordpressTheme.findFirst({
      where: { slug, isActive: true },
      orderBy: { updatedAt: "desc" },
      select: {
        name: true,
        slug: true,
        version: true,
        description: true,
        packageUrl: true,
        screenshotUrl: true,
        changelog: true,
        updatedAt: true,
      },
    });

    if (!theme) throw new ApiError("theme_not_found", 404);

    return jsonOk({
      name: theme.name,
      slug: theme.slug,
      version: theme.version,
      download_url: theme.packageUrl,
      package_url: theme.packageUrl,
      screenshot_url: theme.screenshotUrl,
      requires: "6.0",
      tested: "6.6",
      last_updated: theme.updatedAt.toISOString(),
      sections: {
        description: theme.description ?? "",
        changelog: theme.changelog ?? "",
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
