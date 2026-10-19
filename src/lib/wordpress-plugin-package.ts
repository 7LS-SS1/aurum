import { createHash } from "node:crypto";
import JSZip from "jszip";
import { ApiError } from "@/lib/api-response";
import { getR2ObjectKeyFromPublicUrl } from "@/lib/storage/r2";

const MAX_PLUGIN_BYTES = 100 * 1024 * 1024;

export async function verifyWordpressPluginPackage(input: {
  packageUrl: string;
  slug: string;
  version: string;
  checksumSha256: string;
}): Promise<{ size: number; checksumSha256: string }> {
  if (!getR2ObjectKeyFromPublicUrl(input.packageUrl)) throw new ApiError("plugin_package_must_use_configured_storage", 422);

  const response = await fetch(input.packageUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new ApiError("plugin_package_unavailable", 422);
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > MAX_PLUGIN_BYTES) throw new ApiError("plugin_package_too_large", 422);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_PLUGIN_BYTES) throw new ApiError("plugin_package_invalid_size", 422);

  const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
  if (checksumSha256 !== input.checksumSha256.toLowerCase()) throw new ApiError("plugin_checksum_mismatch", 422);

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new ApiError("plugin_package_invalid_zip", 422);
  }

  const entries = Object.keys(zip.files);
  if (!entries.length || entries.some((name) => name.startsWith("/") || name.includes("../") || name.includes("\\"))) {
    throw new ApiError("plugin_package_unsafe_entries", 422);
  }
  const roots = new Set(entries.map((name) => name.split("/")[0]).filter(Boolean));
  if (roots.size !== 1 || !roots.has(input.slug)) throw new ApiError("plugin_package_root_mismatch", 422);

  const mainFile = zip.file(`${input.slug}/${input.slug}.php`);
  if (!mainFile) throw new ApiError("plugin_main_file_missing", 422);
  const header = await mainFile.async("string");
  const version = header.match(/^\s*\*?\s*Version:\s*(.+?)\s*$/im)?.[1]?.trim();
  if (version !== input.version) throw new ApiError("plugin_header_version_mismatch", 422);

  return { size: bytes.length, checksumSha256 };
}
