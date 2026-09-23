import { cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
const server = path.join(standalone, "server.js");

if (!existsSync(server)) {
  throw new Error("Missing .next/standalone/server.js. Ensure next.config.ts uses output: standalone.");
}

const publicDir = path.join(root, "public");
if (existsSync(publicDir)) {
  await cp(publicDir, path.join(standalone, "public"), { recursive: true, force: true });
}

const staticDir = path.join(root, ".next", "static");
if (!existsSync(staticDir)) {
  throw new Error("Missing .next/static after Next.js build.");
}

await mkdir(path.join(standalone, ".next"), { recursive: true });
await cp(staticDir, path.join(standalone, ".next", "static"), { recursive: true, force: true });

console.log("Prepared Next.js standalone runtime assets.");
