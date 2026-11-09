import { ApiError } from "./api-response";
export function phoneVerificationReady() {
  return !!(process.env.TWILIO_API_KEY && process.env.TWILIO_API_SECRET && /^VA[a-f0-9]{32}$/i.test(process.env.TWILIO_VERIFY_SERVICE_SID || ""));
}
export async function phoneVerification(phone: string, code?: string) {
  if (!phoneVerificationReady()) throw new ApiError("sms_not_configured", 503);
  const response = await fetch(`https://verify.twilio.com/v2/Services/${process.env.TWILIO_VERIFY_SERVICE_SID}/${code ? "VerificationCheck" : "Verifications"}`, {
    method: "POST", headers: {
      Authorization: "Basic " + Buffer.from(process.env.TWILIO_API_KEY + ":" + process.env.TWILIO_API_SECRET).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    }, body: new URLSearchParams(code ? { To: phone, Code: code } : { To: phone, Channel: "sms" }),
    signal: AbortSignal.timeout(15000), cache: "no-store",
  });
  if (!response.ok) throw new ApiError(code ? "invalid_code" : "sms_unavailable", code ? 400 : 503);
  const result = await response.json();
  if (code && (result.status !== "approved" || result.to !== phone)) throw new ApiError("invalid_code", 400);
  if (!code && result.status !== "pending") throw new ApiError("sms_unavailable", 503);
}
