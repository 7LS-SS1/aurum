import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireViewerFromRequest } from "@/lib/viewer-auth";
import {
  readServicePageBody,
  servicePageOriginAllowed,
} from "@/lib/service-page-request";
import {
  readTransferOrder,
  selectTransferAccount,
  submitTransferSlip,
  slipInput,
} from "@/lib/bank-transfer-server";
import { attachmentBytes, readAttachment } from "@/lib/ads-attachments";
import { rateLimit } from "@/lib/rate-limit";
export async function GET(req: NextRequest) {
  try {
    const viewer = await requireViewerFromRequest(req);
    const id = z.string().uuid().parse(req.nextUrl.searchParams.get("id"));
    const data = await readTransferOrder(id, viewer.id);
    const qr = req.nextUrl.searchParams.get("qr");
    if (qr) {
      const a = data.accounts.find((a) => a.id === qr && a.qr);
      if (
        !a?.qr ||
        data.transfer?.accountId !== a.id ||
        data.order.status !== "PAYMENT"
      )
        throw new ApiError("not_found", 404);
      const f = await readAttachment(a.qr);
      return new Response(new Uint8Array(await attachmentBytes(a.qr)), {
        headers: {
          "Content-Type": f.type,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    return jsonOk(
      {
        ...data,
        accounts: data.accounts.map((a) => ({
          id: a.id,
          bank: a.bank,
          name: a.name,
          number:
            data.transfer?.accountId === a.id && data.order.status === "PAYMENT"
              ? a.number
              : "",
          qr: !!a.qr,
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
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
      !(
        await rateLimit(`bank-transfer:${viewer.id}`, {
          limit: 20,
          windowMs: 60000,
        })
      ).success
    )
      throw new ApiError("rate_limited", 429);
    const body = z
      .object({ action: z.enum(["select", "slip"]), data: z.unknown() })
      .strict()
      .parse(await readServicePageBody(req));
    if (body.action === "slip")
      await submitTransferSlip(slipInput.parse(body.data), viewer.id);
    else {
      const input = z
        .object({ id: z.string().uuid(), accountId: z.string().uuid() })
        .strict()
        .parse(body.data);
      await selectTransferAccount(input.id, input.accountId, viewer.id);
    }
    return jsonOk({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
