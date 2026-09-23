// Docker sets HOSTNAME to the container ID. Next.js standalone treats that as
// a bind address, which makes the process unreachable from Coolify's proxy.
// Bind on every container interface unless an explicit application override is
// supplied.
process.env.HOSTNAME = process.env.AURUM_BIND_HOST ?? "0.0.0.0";

await import("../.next/standalone/server.js");
