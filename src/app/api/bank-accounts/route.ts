import { NextRequest } from "next/server";
import { z } from "zod";
import { requireMinRole } from "@/lib/authz";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import {
  servicePageOriginAllowed,
  readServicePageBody,
} from "@/lib/service-page-request";
import {
  addBankAccount,
  readBankAccounts,
  bankDetail,
  closeBankAccount,
  newAccountSchema,
  entryInput,
  recordBankEntry,
  reviewInput,
  reviewTransfer,
} from "@/lib/bank-transfer-server";
import { saveAttachment } from "@/lib/ads-attachments";
export async function GET(req: NextRequest) {
  try {
    await requireMinRole("MANAGER");
    const id = req.nextUrl.searchParams.get("id");
    return jsonOk(
      id
        ? await bankDetail(z.string().uuid().parse(id))
        : { accounts: await readBankAccounts() },
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
    const actor = await requireMinRole("MANAGER");
    if (req.nextUrl.searchParams.get("upload") === "qr") {
      if (
        !["image/png", "image/jpeg", "image/webp"].includes(
          req.headers.get("content-type") || "",
        )
      )
        throw new ApiError("invalid_qr", 422);
      return jsonOk(await saveAttachment(req, `bank:${actor.id}`));
    }
    const body = z
      .object({
        action: z.enum(["create", "close", "entry", "review"]),
        data: z.unknown(),
      })
      .strict()
      .parse(await readServicePageBody(req));
    if (body.action === "create")
      return jsonOk(
        await addBankAccount(newAccountSchema.strict().parse(body.data), actor),
      );
    if (body.action === "close")
      return jsonOk(
        await closeBankAccount(
          z.object({ id: z.string().uuid() }).strict().parse(body.data).id,
          actor,
        ),
      );
    if (body.action === "entry")
      return jsonOk(
        await recordBankEntry(entryInput.strict().parse(body.data), actor),
      );
    await reviewTransfer(reviewInput.parse(body.data), actor);
    return jsonOk({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
