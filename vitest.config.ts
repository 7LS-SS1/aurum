import path from "node:path";
import { defineConfig } from "vitest/config";

// Mirrors tsconfig.json's "@/*" -> "./src/*" path alias so tests can import
// modules the same way the app does, instead of relative "../../../lib/...".
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.{ts,tsx}"],
  },
});
