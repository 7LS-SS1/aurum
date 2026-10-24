import { createHash } from "node:crypto";
import JSZip from "jszip";
import { ApiError } from "@/lib/api-response";
import { getR2ObjectKeyFromPublicUrl } from "@/lib/storage/r2";

const MAX_PLUGIN_BYTES = 100 * 1024 * 1024;

export interface WordpressPluginPackageMetadata {
  size: number;
  checksumSha256: string;
  slug: string;
  version: string;
  name: string;
  requiresWordpress?: string;
  requiresPhp?: string;
}

export async function inspectWordpressPluginPackage(packageUrl: string): Promise<WordpressPluginPackageMetadata> {
  if (!getR2ObjectKeyFromPublicUrl(packageUrl)) throw new ApiError("plugin_package_must_use_configured_storage", 422);

  const response = await fetch(packageUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new ApiError("plugin_package_unavailable", 422);
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > MAX_PLUGIN_BYTES) throw new ApiError("plugin_package_too_large", 422);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_PLUGIN_BYTES) throw new ApiError("plugin_package_invalid_size", 422);

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
  if (roots.size !== 1) throw new ApiError("plugin_package_root_mismatch", 422);
  const slug = [...roots][0]!;
  const mainFile = zip.file(`${slug}/${slug}.php`);
  if (!mainFile) throw new ApiError("plugin_main_file_missing", 422);
  const header = await mainFile.async("string");
  const readHeader = (label: string) => header.match(new RegExp(`^\\s*\\*?\\s*${label}:\\s*(.+?)\\s*$`, "im"))?.[1]?.trim();
  const version = readHeader("Version");
  const name = readHeader("Plugin Name");
  if (!version) throw new ApiError("plugin_header_version_missing", 422);
  if (!name) throw new ApiError("plugin_header_name_missing", 422);

  return {
    size: bytes.length,
    checksumSha256: createHash("sha256").update(bytes).digest("hex"),
    slug,
    version,
    name,
    requiresWordpress: readHeader("Requires at least"),
    requiresPhp: readHeader("Requires PHP"),
  };
}

export async function verifyWordpressPluginPackage(input: {
  packageUrl: string;
  slug: string;
  version: string;
  checksumSha256?: string;
}): Promise<{ size: number; checksumSha256: string }> {
  const metadata = await inspectWordpressPluginPackage(input.packageUrl);
  if (input.checksumSha256 && metadata.checksumSha256 !== input.checksumSha256.toLowerCase()) throw new ApiError("plugin_checksum_mismatch", 422);
  if (metadata.slug !== input.slug) throw new ApiError("plugin_package_root_mismatch", 422);
  if (metadata.version !== input.version) throw new ApiError("plugin_header_version_mismatch", 422);
  return { size: metadata.size, checksumSha256: metadata.checksumSha256 };
}
