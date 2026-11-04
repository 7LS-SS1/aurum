import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import sharp from "sharp";
import { ZipArchive } from "archiver";
import JSZip from "jszip";
import WebSocket from "ws";

const png = await sharp({ create: { width: 32, height: 24, channels: 4, background: "#123456" } }).png().toBuffer();
for (const format of ["jpeg", "webp", "avif"]) {
  const buffer = await sharp(png).resize(16, 12).toFormat(format).toBuffer();
  const metadata = await sharp(buffer).metadata();
  assert.equal(metadata.width, 16);
  assert.equal(metadata.height, 12);
}
const archive = new ZipArchive();
const chunks = [];
archive.on("data", chunk => chunks.push(chunk));
const finished = once(archive, "end");
archive.glob("*.mjs", { cwd: new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1") });
await archive.finalize();
await finished;
const zip = await JSZip.loadAsync(Buffer.concat(chunks));
assert.ok(zip.file("p2p-tracker.mjs"));

const child = spawn(process.execPath, ["scripts/p2p-tracker.mjs"], {
  env: { ...process.env, TRACKER_HOST: "127.0.0.1", TRACKER_PORT: "18007", TRACKER_ALLOWED_ORIGINS: "https://allowed.example" },
  stdio: ["ignore", "pipe", "pipe"],
});
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Tracker startup timed out")), 10000);
    child.once("error", reject);
    child.stdout.on("data", data => { if (data.toString().includes("listening")) { clearTimeout(timer); resolve(); } });
  });
  assert.equal((await fetch("http://127.0.0.1:18007/health")).status, 200);
  const allowed = new WebSocket("ws://127.0.0.1:18007", { origin: "https://allowed.example" });
  await once(allowed, "open");
  allowed.close();
  await once(allowed, "close");
  const denied = new WebSocket("ws://127.0.0.1:18007", { origin: "https://denied.example" });
  const [error] = await once(denied, "error");
  assert.match(error.message, /403/);
  console.log("RELEASE_DEPENDENCIES_OK: image codecs, ZIP glob, tracker health and WebSocket origins");
} finally {
  child.kill();
  await once(child, "exit");
}
