import "server-only";

import {
  AIConfigurationError,
  getTalevoAIProviderId,
} from "@/lib/ai/config";
import { geminiProvider } from "@/lib/ai/providers/gemini";
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

export async function generateAIResponse(
  request: AIProviderRequest,
): Promise<AIProviderResult> {
  const provider = getConfiguredAIProvider();
  if (!provider.isConfigured()) {
    throw new AIConfigurationError();
  }
  return provider.generate(request);
}
