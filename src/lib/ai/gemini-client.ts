import "server-only";

import { isAIProviderConfigured } from "@/lib/ai/config";

export const GEMINI_CLIENT_SOURCE = "google-genai" as const;

export type GeminiApiKeyResolver = () => string;

export function createGeminiClient() {
  return null;
}

export function getSafeGeminiClientDiagnostics() {
  const configured = isAIProviderConfigured();
  return {
    clientSource: configured ? GEMINI_CLIENT_SOURCE : "disconnected",
    credential: {
      present: configured,
      nonEmptyAfterTrim: configured,
      surroundingWhitespace: false,
    },
    explicitApiKey: configured,
    apiMode: configured ? "configured" : "unconfigured",
    vertexMode: false,
  } as const;
}
