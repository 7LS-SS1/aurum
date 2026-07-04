import path from "node:path";
import { ZipArchive } from "archiver";
import { apiError, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { rateLimit } from "@/lib/rate-limit";

// Needs real filesystem + Node stream APIs to zip the theme folder — not
// available in the Edge runtime.
export const runtime = "nodejs";

const THEME_SLUG = "aurum-video";

/** Zips wordpress-theme/aurum-video/ on demand and streams it back as a download — no build step, no stale artifact to keep in sync. */
export async function GET() {
  try {
    const actor = await requireMinRole("STAFF");

    const { success } = await rateLimit(`wp-theme:download:${actor.id}`, { limit: 10, windowMs: 60_000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const themeDir = path.join(process.cwd(), "wordpress-theme", THEME_SLUG);

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const archive = new ZipArchive({ zlib: { level: 9 } });
      const chunks: Buffer[] = [];
      archive.on("data", (chunk: Buffer) => chunks.push(chunk));
      archive.on("end", () => resolve(Buffer.concat(chunks)));
      archive.on("error", (err: Error) => reject(err));
      archive.directory(themeDir, THEME_SLUG);
      void archive.finalize();
    });

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${THEME_SLUG}.zip"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
