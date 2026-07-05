import { NextRequest } from "next/server";
import { apiError, jsonOk } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { presignR2Upload } from "@/lib/storage/r2";
import { assertThemeUploadAllowed, wordpressThemePresignSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  try {
    await requireMinRole("HEAD");
    const input = wordpressThemePresignSchema.parse(await req.json());

    assertThemeUploadAllowed(input.kind, input.filename, input.contentType, input.size);
    const result = await presignR2Upload({
      filename: input.filename,
      contentType: input.contentType,
      folder: input.kind === "package" ? "themes" : "images",
    });

    return jsonOk(result);
  } catch (err) {
    return apiError(err);
  }
}
