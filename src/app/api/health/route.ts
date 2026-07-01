import { jsonOk } from "@/lib/api-response";

export async function GET() {
  return jsonOk({ ok: true, ts: new Date().toISOString() });
}
