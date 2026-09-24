import { describe, expect, it } from "vitest";
import { aiProvider, aiResponsePrompt } from "./ai-provider";

describe("AI providers", () => {
  it("defaults legacy settings to OpenAI and rejects unknown providers", () => {
    expect(aiProvider(undefined)).toBe("openai");
    expect(() => aiProvider("other")).toThrow("content_ai_invalid_provider");
  });
  it("uses the xAI-compatible system and user message shape", () => {
    expect(aiResponsePrompt("grok", "system", "input")).toEqual({ input: [{ role: "system", content: "system" }, { role: "user", content: "input" }] });
  });
});
