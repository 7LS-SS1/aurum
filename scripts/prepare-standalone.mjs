import { cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const buildDir = process.env.AURUM_RELEASE_REVIEW === "true" ? ".next-release-review" : ".next";
const standalone = path.join(root, buildDir, "standalone");
const server = path.join(standalone, "server.js");

if (!existsSync(server)) {
  throw new Error("Missing .next/standalone/server.js. Ensure next.config.ts uses output: standalone.");
}

const publicDir = path.join(root, "public");
if (existsSync(publicDir)) {
  await cp(publicDir, path.join(standalone, "public"), { recursive: true, force: true });
}

const staticDir = path.join(root, buildDir, "static");
if (!existsSync(staticDir)) {
  throw new Error("Missing .next/static after Next.js build.");
}

await mkdir(path.join(standalone, buildDir), { recursive: true });
await cp(staticDir, path.join(standalone, buildDir, "static"), { recursive: true, force: true });

console.log("Prepared Next.js standalone runtime assets.");
await import("./prepare-prisma-runtime.mjs");
