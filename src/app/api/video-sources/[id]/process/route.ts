import { ApiError, jsonOk } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { scannerApiError } from "@/lib/source-scanner/api-error";
import { getSource } from "@/lib/source-scanner/store";
import { runScanner } from "@/lib/source-scanner/worker";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireMinRole("MANAGER");
    const { id } = await params;
    const source = await getSource(id);
    if (source.control !== "RUN") throw new ApiError("กดเริ่ม Task ก่อนสแกน", 409);
    return jsonOk(await runScanner(270_000, id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return scannerApiError(error); }
}
