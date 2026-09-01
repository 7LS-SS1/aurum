import { createWriteStream } from "node:fs";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZipArchive } from "archiver";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginDir = path.join(root, "wordpress-plugin", "aurum-video-core");
const pluginAssets = path.join(pluginDir, "assets");
const pluginSource = await readFile(path.join(pluginDir, "aurum-video-core.php"), "utf8");
const version = pluginSource.match(/^\s*\* Version:\s*([^\s]+)\s*$/m)?.[1];
if (!version) throw new Error("Could not read plugin Version header");
await mkdir(pluginAssets, { recursive: true });
await copyFile(
  path.join(root, "node_modules", "hls.js", "dist", "hls.light.min.js"),
  path.join(pluginAssets, "hls.light.min.js"),
);
const dist = path.join(root, "dist");
await mkdir(dist, { recursive: true });
const zipPath = path.join(dist, `aurum-video-core-${version}.zip`);
await new Promise((resolve, reject) => {
  const output = createWriteStream(zipPath);
  const archive = new ZipArchive({ zlib: { level: 9 } });
  output.on("close", resolve);
  output.on("error", reject);
  archive.on("error", reject);
  archive.pipe(output);
  archive.directory(pluginDir, "aurum-video-core");
  void archive.finalize();
});
const stableZipPath = path.join(dist, "aurum-video-core.zip");
await copyFile(zipPath, stableZipPath);
console.log(`Built ${zipPath}`);
console.log(`Updated ${stableZipPath}`);
