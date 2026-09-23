import { describe, expect, it } from "vitest";

import { databaseUrlWithPoolDefaults } from "./database-url";

describe("databaseUrlWithPoolDefaults", () => {
  it("adds bounded defaults to PostgreSQL runtime connections", () => {
    const result = new URL(databaseUrlWithPoolDefaults(
      "postgresql://user:pass@pooled.db.prisma.io:5432/postgres?sslmode=require",
    )!);

    expect(result.searchParams.get("sslmode")).toBe("require");
    expect(result.searchParams.get("connection_limit")).toBe("5");
    expect(result.searchParams.get("pool_timeout")).toBe("20");
  });

  it("preserves explicit operator settings", () => {
    const result = new URL(databaseUrlWithPoolDefaults(
      "postgres://user:pass@db.example.com/app?connection_limit=9&pool_timeout=30",
      { connectionLimit: "3", poolTimeoutSeconds: "10" },
    )!);

    expect(result.searchParams.get("connection_limit")).toBe("9");
    expect(result.searchParams.get("pool_timeout")).toBe("30");
  });

  it("uses safe defaults for invalid overrides and leaves other URLs unchanged", () => {
    const postgres = new URL(databaseUrlWithPoolDefaults(
      "postgres://user:pass@db.example.com/app",
      { connectionLimit: "0", poolTimeoutSeconds: "invalid" },
    )!);

    expect(postgres.searchParams.get("connection_limit")).toBe("5");
    expect(postgres.searchParams.get("pool_timeout")).toBe("20");
    expect(databaseUrlWithPoolDefaults("file:./dev.db")).toBe("file:./dev.db");
  });
});
