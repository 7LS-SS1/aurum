import { Server } from "bittorrent-tracker";

const port = Number.parseInt(process.env.TRACKER_PORT || "8000", 10);
const hostname = process.env.TRACKER_HOST || "0.0.0.0";
const allowedOrigins = (process.env.TRACKER_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

function originAllowed(origin) {
  if (!allowedOrigins.length) return true;
  return Boolean(origin && allowedOrigins.includes(origin.replace(/\/$/, "")));
}

const tracker = new Server({
  udp: false,
  http: true,
  stats: true,
  trustProxy: process.env.TRACKER_TRUST_PROXY === "true",
  interval: Number.parseInt(process.env.TRACKER_INTERVAL_MS || "120000", 10),
  ws: {
    verifyClient(info, done) {
      const allowed = originAllowed(info.origin);
      done(allowed, allowed ? 101 : 403, allowed ? undefined : "Origin not allowed");
    },
  },
});

tracker.http.prependListener("request", (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ ok: true, swarms: Object.keys(tracker.torrents).length }));
  }
});

tracker.on("error", (error) => {
  console.error("[p2p-tracker] fatal:", error);
  process.exitCode = 1;
});
tracker.on("warning", (warning) => console.warn("[p2p-tracker] warning:", warning.message));

tracker.listen(port, hostname, () => {
  console.log(`[p2p-tracker] listening on ws://${hostname}:${port}`);
});

function shutdown(signal) {
  console.log(`[p2p-tracker] ${signal}, shutting down`);
  tracker.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
