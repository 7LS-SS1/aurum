const DEFAULT_CONNECTION_LIMIT = 5;
const DEFAULT_POOL_TIMEOUT_SECONDS = 20;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Keep a long-running AURUM container from creating a pool based on every CPU
 * visible on the Docker host. Explicit values already present in DATABASE_URL
 * always win, so operators can tune these without changing application code.
 */
export function databaseUrlWithPoolDefaults(
  value: string | undefined,
  options: { connectionLimit?: string; poolTimeoutSeconds?: string } = {},
): string | undefined {
  if (!value) return undefined;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return value;
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return value;

  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set(
      "connection_limit",
      String(positiveInteger(options.connectionLimit, DEFAULT_CONNECTION_LIMIT)),
    );
  }
  if (!url.searchParams.has("pool_timeout")) {
    url.searchParams.set(
      "pool_timeout",
      String(positiveInteger(options.poolTimeoutSeconds, DEFAULT_POOL_TIMEOUT_SECONDS)),
    );
  }

  return url.toString();
}
