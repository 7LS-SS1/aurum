import { NextRequest } from "next/server";
import { apiError, jsonOk } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { presignR2Upload } from "@/lib/storage/r2";
import { assertPluginUploadAllowed, wordpressPluginPresignSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  try {
    await requireMinRole("HEAD");
    const input = wordpressPluginPresignSchema.parse(await req.json());
    assertPluginUploadAllowed(input.kind, input.filename, input.contentType, input.size);
    return jsonOk(await presignR2Upload({ filename: input.filename, contentType: input.contentType, folder: input.kind === "package" ? "plugins" : "images" }));
  } catch (err) {
    return apiError(err);
  }
}
