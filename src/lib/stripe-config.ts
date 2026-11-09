import Stripe from "stripe";
import { ApiError } from "./api-response";

export function stripeSettings(creating = false) {
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (creating && process.env.STRIPE_ENABLED !== "true") throw new ApiError("stripe_disabled", 503);
  if (process.env.STRIPE_ENVIRONMENT !== "sandbox" || !/^(rk|sk)_test_/.test(key)) throw new ApiError("stripe_sandbox_required", 503);
  // Sandbox must not change real orders/inventory in the production database.
  if (process.env.STRIPE_SANDBOX_DB_CONFIRMED !== "true") throw new ApiError("stripe_test_database_required", 503);
  const accountId = process.env.STRIPE_ACCOUNT_ID || "";
  if (!/^acct_[a-zA-Z0-9]+$/.test(accountId)) throw new ApiError("stripe_account_required", 503);
  let url: URL;
  try { url = new URL(process.env.STRIPE_PUBLIC_BASE_URL || ""); } catch { throw new ApiError("stripe_base_url_invalid", 503); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) throw new ApiError("stripe_base_url_invalid", 503);
  return { key, accountId, origin: url.origin };
}

export function stripeClient() {
  const settings = stripeSettings();
  return { client: new Stripe(settings.key, { maxNetworkRetries: 2, timeout: 15000 }), settings };
}

export async function stripeAccountCheck(client: Stripe, accountId: string) {
  if ((await client.accounts.retrieve(null)).id !== accountId) throw new ApiError("stripe_account_mismatch", 503);
}

// Never pass Stripe error objects to the shared logger (request data may contain secrets).
export function stripeError(error: unknown): never {
  if (error instanceof ApiError) throw error;
  throw new ApiError("stripe_request_failed_check_existing_payment", 502);
}
