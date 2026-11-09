import { z } from "zod";
import { requireMinRole } from "@/lib/authz";
import { apiError, jsonOk } from "@/lib/api-response";
import { readAdminOrder, paymentReady } from "@/lib/ads-orders";
import { promptPayReady } from "@/lib/promptpay-2c2p";
import { simulationEnabled } from "@/lib/ads-simulation-server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireMinRole("MANAGER");
    const id = z.string().uuid().parse((await params).id);
    return jsonOk({ ...await readAdminOrder(id), promptPayReady: promptPayReady(), paymentReady: paymentReady(), simulationEnabled: simulationEnabled() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
