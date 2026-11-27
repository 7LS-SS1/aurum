import { apiError, jsonOk } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { checkDownload, checkDownloadSchema } from "@/lib/auto-download";
import { ScannerError } from "@/lib/source-scanner/contracts";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: Request) {
  try {
    await requireMinRole("STAFF");
    const { urls } = checkDownloadSchema.parse(await req.json());
    const checks = [];
    for (const url of urls) {
      const signal = AbortSignal.any([req.signal, AbortSignal.timeout(15000)]);
      try { checks.push({ ok: true, ...await checkDownload(url, signal) }); }
      catch (error) {
        const failure = signal.aborted ? new ScannerError("TIMEOUT") : error instanceof ScannerError ? error : new ScannerError("SOURCE_HTTP");
        checks.push({ ok: false, error: failure.message });
      }
      if (req.signal.aborted) break;
    }
    return jsonOk({ checks }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
