export const AI_PROVIDERS = ["openai", "grok"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

// Fixed destinations prevent a saved configuration from redirecting an API key.
export const AI_PROVIDER_DETAILS = {
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", modelExample: "gpt-4.1-mini" },
  grok: { label: "Grok (xAI)", baseUrl: "https://api.x.ai/v1", modelExample: "grok-4.1-fast" },
} as const;

export function aiProvider(value: unknown): AiProvider {
  if (value === undefined || value === null) return "openai";
  if (value === "openai" || value === "grok") return value;
  throw new Error("content_ai_invalid_provider");
}

export function aiResponsePrompt(provider: AiProvider, instructions: string, input: string) {
  return provider === "grok"
    ? { input: [{ role: "system", content: instructions }, { role: "user", content: input }] }
    : { instructions, input };
}
