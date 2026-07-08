import { z } from "zod";

/**
 * .env.example uses `""` as the "not configured" convention for every
 * optional var (R2_*, BUNNY_*, UPSTASH_*, ...) — treat empty string the same
 * as unset so a freshly-copied .env doesn't fail validation before any of
 * those integrations are actually wired up.
 */
const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);
const optionalUrl = () => z.preprocess(emptyToUndefined, z.string().url().optional());
const optionalString = () => z.preprocess(emptyToUndefined, z.string().optional());

/**
 * Fail fast at boot if required secrets are missing/malformed, instead of
 * surfacing a confusing runtime error the first time a route touches them.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  DIRECT_URL: optionalUrl(),

  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  AUTH_URL: optionalUrl(),

  ENCRYPTION_KEY: z
    .string()
    .length(64, "ENCRYPTION_KEY must be 64 hex characters (32 bytes)")
    .regex(/^[0-9a-f]+$/i, "ENCRYPTION_KEY must be hex"),

  R2_ACCOUNT_ID: optionalString(),
  R2_ACCESS_KEY_ID: optionalString(),
  R2_SECRET_ACCESS_KEY: optionalString(),
  R2_BUCKET_NAME: optionalString(),
  R2_PUBLIC_HOSTNAME: optionalString(),
  NEXT_PUBLIC_R2_PUBLIC_URL: optionalUrl(),

  BUNNY_LIBRARY_ID: optionalString(),
  BUNNY_API_KEY: optionalString(),
  BUNNY_CDN_HOST: optionalString(),
  // Account-level key (dash.bunny.net → account menu → "API" / "API Key") —
  // required for api.bunny.net/videolibrary/* calls (Allowed Referrers sync).
  // Distinct from BUNNY_API_KEY, which is the per-library Stream key used
  // against video.bunnycdn.com for upload/delete and does NOT work here.
  BUNNY_ACCOUNT_API_KEY: optionalString(),
  // AURUM's own public hostname — kept allowed as a Bunny referrer so the
  // admin UI itself can preview videos. Defaults to the sslip.io host below.
  AURUM_PUBLIC_HOSTNAME: optionalString(),

  UPSTASH_REDIS_REST_URL: optionalUrl(),
  UPSTASH_REDIS_REST_TOKEN: optionalString(),

  // Shared secret for the SYSTEM role — internal automation/API jobs send
  // this in an X-System-Key header instead of ever logging in interactively.
  SYSTEM_API_KEY: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Lazily parsed so unit tests / edge middleware can stub process.env first. */
export function env(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
      throw new Error(`Invalid environment configuration:\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}
