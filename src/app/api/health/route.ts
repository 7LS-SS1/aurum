import { jsonOk } from "@/lib/api-response";

export async function GET() {
  return jsonOk({
    ok: true,
    ts: new Date().toISOString(),
    runtime: process.env.NODE_ENV ?? "unknown",
    build: {
      gitSha: [process.env.SOURCE_COMMIT, process.env.GIT_COMMIT_SHA, process.env.GIT_SHA, process.env.COOLIFY_GIT_COMMIT_SHA]
        .find(value => value && /^[0-9a-f]{7,64}$/i.test(value)) ?? "unknown",
    },
  });
}
