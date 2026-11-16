import { NextRequest } from "next/server";
import { requireMinRole } from "@/lib/authz";
import { apiError, ApiError, jsonOk } from "@/lib/api-response";
import {
  readServicePageBody,
  servicePageOriginAllowed,
} from "@/lib/service-page-request";
import { listWallets, saveWallet } from "@/lib/usdt-server";
import { wallet } from "@/lib/usdt";
export async function GET() {
  try {
    await requireMinRole("MANAGER");
    return jsonOk(await listWallets(), {
      headers: { "Cache-Control": "private,no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    const actor = await requireMinRole("MANAGER");
    if (!servicePageOriginAllowed(req.headers.get("origin"), req.url))
      throw new ApiError("invalid_origin", 403);
    await saveWallet(
      wallet.parse(await readServicePageBody(req)),
      actor,
    );
    return jsonOk({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
