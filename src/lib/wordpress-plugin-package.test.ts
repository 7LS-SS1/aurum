import { createHash } from "node:crypto";
import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage/r2", () => ({ getR2ObjectKeyFromPublicUrl: vi.fn(() => "plugins/plugin.zip") }));
import { inspectWordpressPluginPackage, verifyWordpressPluginPackage } from "@/lib/wordpress-plugin-package";

async function packageBytes(root = "aurum-video-core", version = "1.3.7") {
  const zip = new JSZip();
  zip.file(`${root}/${root}.php`, `<?php\n/*\nPlugin Name: AURUM Video Core\nVersion: ${version}\n*/`);
  zip.file(`${root}/includes/admin.php`, "<?php");
  return Buffer.from(await zip.generateAsync({ type: "uint8array" }));
}

beforeEach(() => vi.restoreAllMocks());

describe("verifyWordpressPluginPackage", () => {
  it("inspects the canonical slug, name, and version from the ZIP instead of its filename", async () => {
    const bytes = await packageBytes("retrotube-banner-add-on", "2.2.4");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(bytes, { status: 200 })));
    await expect(inspectWordpressPluginPackage("https://cdn.example.com/plugins/ads-banner-add-on-2.2.4.zip")).resolves.toMatchObject({
      slug: "retrotube-banner-add-on",
      name: "AURUM Video Core",
      version: "2.2.4",
    });
  });
  it("accepts a safe single-root plugin whose header and checksum match", async () => {
    const bytes = await packageBytes();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(bytes, { status: 200, headers: { "content-length": String(bytes.length) } })));
    await expect(verifyWordpressPluginPackage({ packageUrl: "https://cdn.example.com/plugins/plugin.zip", slug: "aurum-video-core", version: "1.3.7", checksumSha256: createHash("sha256").update(bytes).digest("hex") })).resolves.toEqual({ size: bytes.length, checksumSha256: createHash("sha256").update(bytes).digest("hex") });
  });

  it("rejects a checksum mismatch before trusting the archive", async () => {
    const bytes = await packageBytes();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(bytes, { status: 200 })));
    await expect(verifyWordpressPluginPackage({ packageUrl: "https://cdn.example.com/plugins/plugin.zip", slug: "aurum-video-core", version: "1.3.7", checksumSha256: "0".repeat(64) })).rejects.toThrow("plugin_checksum_mismatch");
  });

  it("rejects a root folder that does not match the plugin slug", async () => {
    const bytes = await packageBytes("wrong-root");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(bytes, { status: 200 })));
    await expect(verifyWordpressPluginPackage({ packageUrl: "https://cdn.example.com/plugins/plugin.zip", slug: "aurum-video-core", version: "1.3.7", checksumSha256: createHash("sha256").update(bytes).digest("hex") })).rejects.toThrow("plugin_package_root_mismatch");
  });

  it("rejects a Version header that differs from the release", async () => {
    const bytes = await packageBytes("aurum-video-core", "1.3.6");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(bytes, { status: 200 })));
    await expect(verifyWordpressPluginPackage({ packageUrl: "https://cdn.example.com/plugins/plugin.zip", slug: "aurum-video-core", version: "1.3.7", checksumSha256: createHash("sha256").update(bytes).digest("hex") })).rejects.toThrow("plugin_header_version_mismatch");
  });
});
