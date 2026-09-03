import "server-only";

import Groq from "groq-sdk";
import {
  AI_PROVIDER_TIMEOUT_MS,
  AIConfigurationError,
  getTalevoAIModel,
  isAIProviderConfigured,
  TALEVO_AI_SYSTEM_INSTRUCTION,
} from "@/lib/ai/config";
import {
  AIProviderError,
  type AIProviderErrorKind,
  type SafeAIProviderError,
} from "@/lib/ai/providers/gemini";
import type {
  AIProviderAdapter,
  AIProviderRequest,
  AIProviderResult,
} from "@/lib/ai/types";

export type { AIProviderErrorKind, SafeAIProviderError };

const EMPTY_SAFE_ERROR: SafeAIProviderError = {
  httpStatus: null,
  providerCode: null,
  providerStatus: null,
  reason: "UNKNOWN",
};

export function sanitizeProviderText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return (
    value
      .replace(/https?:\/\/\S+/gi, "[redacted-url]")
      .replace(/gsk_[\w-]+/g, "[redacted-key]")
      .replace(/AIza[\w-]+/g, "[redacted-key]")
      .replace(/\b(?:key|token|authorization)=[^\s&]+/gi, "[redacted-credential]")
      .replace(/[A-Za-z0-9+/=_-]{96,}/g, "[redacted-data]")
      .replace(/\{[\s\S]*\}/g, "[redacted-provider-details]")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 320) || null
  );
}

export function extractSafeGroqError(error: unknown): SafeAIProviderError {
  if (!error || typeof error !== "object") return EMPTY_SAFE_ERROR;
  const record = error as Record<string, unknown>;

  let httpStatus: number | null = null;
  let providerCode: number | string | null = null;
  let providerStatus: string | null = null;
  let reason: SafeAIProviderError["reason"] = "UNKNOWN";

  if (typeof record.status === "number") httpStatus = record.status;
  if (typeof record.code === "number" || typeof record.code === "string") providerCode = record.code;
  if (typeof record.statusText === "string") providerStatus = sanitizeProviderText(record.statusText);

  let errorString = String(record.message || "");
  try {
    errorString += " " + JSON.stringify(record);
  } catch {
    // ignore circular
  }

  if (/invalid_api_key|api_key_invalid|key not valid|unauthorized/i.test(errorString)) {
    reason = "API_KEY_INVALID";
  } else if (httpStatus === 401) {
    reason = "UNAUTHENTICATED";
  } else if (httpStatus === 403) {
    reason = "PERMISSION_DENIED";
  } else if (httpStatus === 429) {
    reason = "RATE_LIMITED";
  } else if (httpStatus === 400) {
    reason = "BAD_REQUEST";
  }

  return { httpStatus, providerCode, providerStatus, reason };
}

function formatChatMessages(request: AIProviderRequest): Groq.Chat.ChatCompletionMessageParam[] {
  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: TALEVO_AI_SYSTEM_INSTRUCTION,
    },
  ];

  // Keep context bounded (max 8,000 chars for Groq Free token safety)
  const trimmedContext = request.contextBlock.trim();
  if (trimmedContext) {
    const boundedContext = trimmedContext.length > 8_000
      ? trimmedContext.slice(0, 8_000) + "\n[Context truncated for length]"
      : trimmedContext;
    messages.push({
      role: "system",
      content: `[TALEVO CONTEXT]\n${boundedContext}\n[/TALEVO CONTEXT]`,
    });
  }

  // Keep history bounded (max 4 most recent items, 4,000 chars total)
  if (request.history && request.history.length > 0) {
    const recentHistory = request.history.slice(-4);
    for (const item of recentHistory) {
      const content = item.content.trim().slice(0, 1_000);
      if (content) {
        messages.push({
          role: item.role === "assistant" ? "assistant" : "user",
          content,
        });
      }
    }
  }

  messages.push({
    role: "user",
    content: request.message.trim().slice(0, 4_000),
  });

  return messages;
}

function createClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new AIConfigurationError();
  }
  return new Groq({ apiKey });
}

export class GroqProviderAdapter implements AIProviderAdapter {
  readonly id = "groq" as const;

  isConfigured(): boolean {
    return isAIProviderConfigured("groq");
  }

  async generate(request: AIProviderRequest): Promise<AIProviderResult> {
    if (!this.isConfigured()) {
      throw new AIConfigurationError();
    }

    if (request.signal?.aborted) {
      throw new AIProviderError("cancelled");
    }

    const client = createClient();
    const model = getTalevoAIModel("groq");
    const messages = formatChatMessages(request);

    // Timeout signal handling
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort(new Error("AI_PROVIDER_TIMEOUT"));
    }, AI_PROVIDER_TIMEOUT_MS);

    const onCallerAbort = () => {
      abortController.abort(request.signal?.reason || new Error("CALLER_ABORTED"));
    };

    if (request.signal) {
      request.signal.addEventListener("abort", onCallerAbort, { once: true });
    }

    try {
      const response = await client.chat.completions.create(
        {
          model,
          messages,
          temperature: 0.3,
        },
        {
          signal: abortController.signal,
          timeout: AI_PROVIDER_TIMEOUT_MS,
        },
      );

      const content = response.choices[0]?.message?.content?.trim();
      if (content && content.length > 0) {
        return {
          text: content,
          model,
          provider: "groq",
          operation: "chat.completions.create",
        };
      }

      throw new AIProviderError("unavailable", {
        httpStatus: 502,
        providerCode: null,
        providerStatus: "EMPTY_RESPONSE",
        reason: "UNKNOWN",
      });
    } catch (error) {
      if (error instanceof AIConfigurationError) {
        throw error;
      }
      if (error instanceof AIProviderError) {
        throw error;
      }

      if (request.signal?.aborted) {
        throw new AIProviderError("cancelled");
      }

      if (
        abortController.signal.aborted ||
        (error instanceof Error &&
          (error.name === "TimeoutError" ||
            error.message.includes("AI_PROVIDER_TIMEOUT") ||
            error.message.includes("timeout")))
      ) {
        throw new AIProviderError("timeout", extractSafeGroqError(error));
      }

      if (error instanceof Groq.APIError) {
        const safe = extractSafeGroqError(error);
        if (error.status === 429) {
          throw new AIProviderError("quota", safe);
        }
        if (error.status === 408 || error.status === 504) {
          throw new AIProviderError("timeout", safe);
        }
        throw new AIProviderError("unavailable", safe);
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new AIProviderError("cancelled");
      }

      throw new AIProviderError("unavailable", extractSafeGroqError(error));
    } finally {
      clearTimeout(timeoutId);
      if (request.signal) {
        request.signal.removeEventListener("abort", onCallerAbort);
      }
    }
  }
}

export const groqProvider = new GroqProviderAdapter();
