import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-response";
import { promptPayConfig } from "@/lib/promptpay-2c2p";

// The hosted page posts an untrusted paymentResponse form. Do not interpret it
// as payment evidence; only the signed server inquiry can update the order.
async function returnToOrder(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await params).id);
    const { origin } = promptPayConfig();
    return NextResponse.redirect(`${origin}/services/ads-banner/checkout/${id}`, {
      status: 303,
      headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
    });
  } catch (error) { return apiError(error); }
}
export const POST = returnToOrder;
export const GET = returnToOrder;
