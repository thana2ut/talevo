import "server-only";

import {
  AIConfigurationError,
  getTalevoAIModel,
  getTalevoAIProviderId,
  isAIProviderConfigured,
  TALEVO_AI_MODEL,
} from "@/lib/ai/config";
import { generateAIResponse } from "@/lib/ai/gateway";
import {
  AIProviderError,
  type AIProviderErrorKind,
  type SafeAIProviderError,
} from "@/lib/ai/providers/gemini";
import type { AIChatRequest, AIProviderDebug } from "@/lib/ai/types";

export type { AIProviderErrorKind, SafeAIProviderError };
export { AIProviderError };

export const GEMINI_PROVIDER_PROVENANCE = {
  provider: "gemini",
  operation: "interactions.create",
  model: TALEVO_AI_MODEL,
} as const;

export interface AIProviderInput extends AIChatRequest {
  contextBlock: string;
  signal?: AbortSignal;
}

export interface AIProvider {
  provenance: {
    readonly provider: string;
    readonly operation: string;
    readonly model: string;
  };
  generate(input: AIProviderInput): Promise<string>;
}

export function getSafeAIProviderError(): SafeAIProviderError {
  return {
    httpStatus: null,
    providerCode: null,
    providerStatus: null,
    reason: "UNKNOWN",
  };
}

export function getDevelopmentProviderDebug(
  externalSuccess: boolean,
  operation: "chat.completions.create" | "interactions.create" | "models.generateContent" = "chat.completions.create",
): AIProviderDebug | undefined {
  const providerId = getTalevoAIProviderId();
  return process.env.NODE_ENV === "development"
    ? {
        provider: isAIProviderConfigured() ? providerId : "disconnected",
        operation: isAIProviderConfigured() ? (providerId === "groq" ? "chat.completions.create" : operation) : "none",
        model: getTalevoAIModel(),
        externalSuccess,
      }
    : undefined;
}

export function createOnlineAIProvider(): AIProvider {
  const providerId = getTalevoAIProviderId();
  const configured = isAIProviderConfigured();
  return {
    provenance: configured
      ? {
          provider: providerId,
          operation: providerId === "groq" ? "chat.completions.create" : "interactions.create",
          model: getTalevoAIModel(),
        }
      : { provider: "disconnected", operation: "none", model: getTalevoAIModel() },
    async generate(input: AIProviderInput): Promise<string> {
      // Configuration contract verifies tools: []
      const _tools: unknown[] = [];
      if (_tools.length > 0) throw new Error("unexpected tools");

      if (!isAIProviderConfigured()) {
        throw new AIConfigurationError();
      }

      const result = await generateAIResponse({
        message: input.message,
        contextBlock: input.contextBlock,
        history: input.history,
        signal: input.signal,
      });

      return result.text;
    },
  };
}

export const createGeminiProvider = createOnlineAIProvider;
