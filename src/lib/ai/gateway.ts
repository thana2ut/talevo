import "server-only";

import {
  AIConfigurationError,
  getConfiguredAIProviderIds,
  getAIProviderKeys,
  type AIProviderId,
  getTalevoAIProviderId,
} from "@/lib/ai/config";
import { AIProviderError, geminiProvider } from "@/lib/ai/providers/gemini";
import { groqProvider } from "@/lib/ai/providers/groq";
import type {
  AIProviderAdapter,
  AIProviderRequest,
  AIProviderResult,
} from "@/lib/ai/types";

const disconnectedProvider: AIProviderAdapter = {
  id: "disconnected",
  isConfigured: () => false,
  async generate(): Promise<AIProviderResult> {
    throw new AIConfigurationError();
  },
};

/**
 * AI Gateway decides which provider is currently active.
 * Decouples caller code from provider-specific implementations.
 */
export function getConfiguredAIProvider(): AIProviderAdapter {
  const providerId = getTalevoAIProviderId();
  if (providerId === "groq") {
    return groqProvider;
  }
  if (providerId === "gemini") {
    return geminiProvider;
  }
  return disconnectedProvider;
}

export function isOnlineAIConfigured(): boolean {
  const provider = getConfiguredAIProvider();
  return provider.isConfigured();
}

export async function withAIProviderFallback<T>(
  signal: AbortSignal | undefined,
  generate: (provider: Exclude<AIProviderId, "disconnected">, key: string) => Promise<T>,
): Promise<T> {
  let lastError: unknown = new AIConfigurationError();
  for (const provider of getConfiguredAIProviderIds()) {
    for (const key of getAIProviderKeys(provider)) {
      if (signal?.aborted) throw new AIProviderError("cancelled");
      try {
        return await generate(provider, key);
      } catch (error) {
        if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
        if (error instanceof AIProviderError && error.kind === "cancelled") throw error;
        lastError = error;
      }
    }
  }
  throw lastError;
}

export function generateAIResponse(request: AIProviderRequest): Promise<AIProviderResult> {
  return withAIProviderFallback(request.signal, (provider, key) =>
    (provider === "groq" ? groqProvider : geminiProvider).generate(request, key));
}
