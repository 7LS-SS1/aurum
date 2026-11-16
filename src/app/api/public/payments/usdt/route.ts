import { NextRequest } from "next/server";
import { z } from "zod";
import { requireViewerFromRequest } from "@/lib/viewer-auth";
import { apiError, ApiError, jsonOk } from "@/lib/api-response";
import {
  readServicePageBody,
  servicePageOriginAllowed,
} from "@/lib/service-page-request";
import {
  checkoutState,
  openInvoice,
  checkOwnedInvoice,
} from "@/lib/usdt-server";
import { address, networks, tronAddress } from "@/lib/usdt";
import { rateLimit } from "@/lib/rate-limit";
export async function GET(req: NextRequest) {
  try {
    const viewer = await requireViewerFromRequest(req);
    return jsonOk(
      await checkoutState(
        z.string().uuid().parse(req.nextUrl.searchParams.get("id")),
        viewer.id,
        networks.parse(req.nextUrl.searchParams.get("network") ?? "bsc"),
      ),
      { headers: { "Cache-Control": "private,no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    if (!servicePageOriginAllowed(req.headers.get("origin"), req.url))
      throw new ApiError("invalid_origin", 403);
    const viewer = await requireViewerFromRequest(req);
    if (
      !(await rateLimit("usdt:" + viewer.id, { limit: 10, windowMs: 60000 }))
        .success
    )
      throw new ApiError("rate_limited", 429);
    if (req.nextUrl.searchParams.get("check") === "1") {
      const b = z
        .object({ id: z.string().uuid() })
        .strict()
        .parse(await readServicePageBody(req));
      await checkOwnedInvoice(b.id, viewer.id);
      return jsonOk({ ok: true });
    }
    const input = await readServicePageBody(req);
    const mobile = z
      .object({
        id: z.string().uuid(),
        method: z.literal("mobile"),
        network: networks,
      })
      .strict()
      .safeParse(input);
    if (mobile.success)
      return jsonOk(
        await openInvoice(mobile.data.id, viewer.id, null, mobile.data.network),
      );
    const b = z
      .object({
        id: z.string().uuid(),
        from: z.string(),
        network: networks.default("bsc"),
      })
      .strict()
      .parse(input);
    return jsonOk(
      await openInvoice(
        b.id,
        viewer.id,
        b.network === "tron"
          ? tronAddress.parse(b.from)
          : address.parse(b.from).toLowerCase(),
        b.network,
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}
