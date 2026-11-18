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
  generate: (provider: Exclude<AIProviderId, "disconnected">, key: string, attemptSignal?: AbortSignal) => Promise<T>,
  imageAttemptTimeoutMs?: number,
): Promise<T> {
  let lastError: unknown = new AIConfigurationError();
  const providers = getConfiguredAIProviderIds().map(provider => ({ provider, keys: getAIProviderKeys(provider) }));
  const attempts = providers.flatMap(({ provider, keys }) => keys.map((key, index) => ({ provider, key, index })));
  if (imageAttemptTimeoutMs) attempts.sort((a, b) => a.index - b.index);
  for (const { provider, key } of attempts) {
      if (signal?.aborted) throw new AIProviderError("cancelled");
      const deadline = imageAttemptTimeoutMs && attempts.length > 1 ? AbortSignal.timeout(imageAttemptTimeoutMs) : undefined;
      const attemptSignal = deadline && signal ? AbortSignal.any([deadline, signal]) : deadline ?? signal;
      try {
        return await generate(provider, key, attemptSignal);
      } catch (error) {
        if (signal?.aborted) throw error;
        if (!deadline?.aborted && ((error instanceof Error && error.name === "AbortError")
          || (error instanceof AIProviderError && error.kind === "cancelled"))) throw error;
        lastError = error;
      }
  }
  throw lastError;
}

export function generateAIResponse(request: AIProviderRequest): Promise<AIProviderResult> {
  return withAIProviderFallback(request.signal, (provider, key) =>
    (provider === "groq" ? groqProvider : geminiProvider).generate(request, key));
}
