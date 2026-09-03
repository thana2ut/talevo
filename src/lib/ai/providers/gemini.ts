import "server-only";

import { ApiError, GoogleGenAI } from "@google/genai";
import {
  AI_PROVIDER_TIMEOUT_MS,
  AIConfigurationError,
  getTalevoAIModel,
  isAIProviderConfigured,
  TALEVO_AI_SYSTEM_INSTRUCTION,
} from "@/lib/ai/config";
import { buildTemporalContextBlock, getAuthoritativeTemporalContext } from "@/lib/ai/temporal-context";
import type {
  AIProviderAdapter,
  AIProviderRequest,
  AIProviderResult,
} from "@/lib/ai/types";

export type AIProviderErrorKind = "cancelled" | "quota" | "timeout" | "unavailable";

export type SafeAIProviderError = {
  httpStatus: number | null;
  providerCode: number | string | null;
  providerStatus: string | null;
  reason: "API_KEY_INVALID" | "BAD_REQUEST" | "PERMISSION_DENIED" | "RATE_LIMITED" | "UNAUTHENTICATED" | "UNKNOWN";
};

const EMPTY_SAFE_ERROR: SafeAIProviderError = {
  httpStatus: null,
  providerCode: null,
  providerStatus: null,
  reason: "UNKNOWN",
};

export class AIProviderError extends Error {
  constructor(
    public readonly kind: AIProviderErrorKind,
    public readonly diagnostic: SafeAIProviderError = EMPTY_SAFE_ERROR,
  ) {
    super(`AI provider ${kind}`);
    this.name = "AIProviderError";
  }
}

export function sanitizeProviderText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/AIza[\w-]+/g, "[redacted-key]")
    .replace(/\b(?:key|token|authorization)=[^\s&]+/gi, "[redacted-credential]")
    .replace(/[A-Za-z0-9+/=_-]{96,}/g, "[redacted-data]")
    .replace(/\{[\s\S]*\}/g, "[redacted-provider-details]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320) || null;
}

export function extractSafeProviderError(error: unknown): SafeAIProviderError {
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

  if (/API_KEY_INVALID|key not valid/i.test(errorString)) {
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

function formatPromptInput(request: AIProviderRequest): string {
  const sections: string[] = [];

  const temporalBlock = request.contextBlock.includes("[CURRENT_TIME_CONTEXT]")
    ? ""
    : buildTemporalContextBlock(getAuthoritativeTemporalContext());

  const fullContext = [temporalBlock, request.contextBlock.trim()].filter(Boolean).join("\n\n").trim();
  if (fullContext) {
    sections.push(`[TALEVO CONTEXT]\n${fullContext}\n[/TALEVO CONTEXT]`);
  }

  if (request.history && request.history.length > 0) {
    const historyLines = request.history.map((item) => {
      const label = item.role === "assistant" ? "Assistant" : "Student";
      return `${label}: ${item.content.trim()}`;
    });
    sections.push(`[PREVIOUS CONVERSATION]\n${historyLines.join("\n\n")}\n[/PREVIOUS CONVERSATION]`);
  }

  sections.push(`Student: ${request.message.trim()}`);
  return sections.join("\n\n");
}

function createClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new AIConfigurationError();
  }
  return new GoogleGenAI({ apiKey });
}

export class GeminiProviderAdapter implements AIProviderAdapter {
  readonly id = "gemini" as const;

  isConfigured(): boolean {
    return isAIProviderConfigured();
  }

  async generate(request: AIProviderRequest): Promise<AIProviderResult> {
    if (!this.isConfigured()) {
      throw new AIConfigurationError();
    }

    if (request.signal?.aborted) {
      throw new AIProviderError("cancelled");
    }

    const client = createClient();
    const model = getTalevoAIModel();
    const prompt = formatPromptInput(request);
    const _tools: unknown[] = [];
    void _tools;

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
      // Primary: Gemini Interactions API
      try {
        const interaction = await client.interactions.create(
          {
            model,
            input: prompt,
            system_instruction: TALEVO_AI_SYSTEM_INSTRUCTION,
            tools: [],
            store: false,
            stream: false,
          },
          {
            timeout: AI_PROVIDER_TIMEOUT_MS,
            fetchOptions: { signal: abortController.signal },
          },
        );

        if (interaction.output_text && interaction.output_text.trim().length > 0) {
          return {
            text: interaction.output_text.trim(),
            model,
            provider: "gemini",
            operation: "interactions.create",
          };
        }
      } catch (interactionError) {
        // If caller aborted or timed out, do not attempt fallback
        if (request.signal?.aborted || abortController.signal.aborted) {
          throw interactionError;
        }

        // If interactions API endpoint returned 404 / NOT_FOUND / method unsupported on this key tier,
        // fall back to models.generateContent for maximum compatibility.
        const isEndpointNotFound =
          (interactionError instanceof ApiError && interactionError.status === 404) ||
          (interactionError instanceof Error && /not found|unsupported|not supported|unknown method/i.test(interactionError.message));

        if (!isEndpointNotFound) {
          throw interactionError;
        }

        const response = await client.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction: TALEVO_AI_SYSTEM_INSTRUCTION,
            tools: [],
            abortSignal: abortController.signal,
            httpOptions: { timeout: AI_PROVIDER_TIMEOUT_MS },
          },
        });

        const text = response.text?.trim();
        if (text) {
          return {
            text,
            model,
            provider: "gemini",
            operation: "models.generateContent",
          };
        }

        throw new AIProviderError("unavailable", {
          httpStatus: 502,
          providerCode: null,
          providerStatus: "EMPTY_RESPONSE",
          reason: "UNKNOWN",
        });
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
        (error instanceof Error && (error.name === "TimeoutError" || error.message.includes("AI_PROVIDER_TIMEOUT") || error.message.includes("timeout")))
      ) {
        throw new AIProviderError("timeout", extractSafeProviderError(error));
      }

      if (error instanceof ApiError) {
        const safe = extractSafeProviderError(error);
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

      throw new AIProviderError("unavailable", extractSafeProviderError(error));
    } finally {
      clearTimeout(timeoutId);
      if (request.signal) {
        request.signal.removeEventListener("abort", onCallerAbort);
      }
    }
  }
}

export const geminiProvider = new GeminiProviderAdapter();
