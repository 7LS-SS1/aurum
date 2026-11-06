import { NextRequest } from "next/server";
import { ApiError, apiError, jsonOk } from "@/lib/api-response";
import { sources, tokenMatches } from "@/lib/monitor/config";
import { sampleSchema } from "@/lib/monitor/types";
import { saveSample } from "@/lib/monitor/store";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    const id = req.headers.get("x-monitor-source"),
      source = sources().find((s) => s.id === id);
    if (
      !source ||
      !tokenMatches(
        req.headers.get("authorization")?.replace(/^Bearer /, "") || "",
        source.tokenHash,
      )
    )
      throw new ApiError("unauthorized", 401);
    // Stream with a hard limit, including chunked requests without Content-Length.
    const reader = req.body?.getReader();
    if (!reader) throw new ApiError("missing_body", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 4096) {
          await reader.cancel();
          throw new ApiError("payload_too_large", 413);
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new ApiError("invalid_json", 400);
    }
    const sample = sampleSchema.parse(body),
      age = Date.now() - Date.parse(sample.timestamp);
    if (age > Math.max(120000, source.intervalSeconds * 2000) || age < -30000)
      throw new ApiError("sample_timestamp_out_of_window", 422);
    const accepted = await saveSample(source, sample);
    return jsonOk(
      { accepted: accepted === 1 },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
