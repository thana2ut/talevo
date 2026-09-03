import {
  AI_HISTORY_ITEM_MAX_LENGTH,
  AI_HISTORY_MAX_ITEMS,
  AI_HISTORY_MAX_TOTAL_LENGTH,
  AI_MESSAGE_MAX_LENGTH,
} from "@/lib/ai/config";
import {
  AI_CONTEXT_KEYS,
  EMPTY_AI_CONTEXT_SELECTION,
  type AIChatRequest,
  type AIContextSelection,
  type AIHistoryItem,
} from "@/lib/ai/types";

const REQUEST_KEYS = new Set(["message", "selectedContext", "history"]);

export class AIRequestValidationError extends Error {
  constructor() {
    super("Invalid AI chat request");
    this.name = "AIRequestValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSelection(value: unknown): AIContextSelection {
  if (value === undefined) return { ...EMPTY_AI_CONTEXT_SELECTION };
  if (!isRecord(value) || Object.keys(value).some((key) => !AI_CONTEXT_KEYS.includes(key as never))) {
    throw new AIRequestValidationError();
  }
  return Object.fromEntries(AI_CONTEXT_KEYS.map((key) => {
    const selected = value[key];
    if (selected !== undefined && typeof selected !== "boolean") throw new AIRequestValidationError();
    return [key, selected === true];
  })) as AIContextSelection;
}

function parseHistory(value: unknown): AIHistoryItem[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > AI_HISTORY_MAX_ITEMS) throw new AIRequestValidationError();
  let totalLength = 0;
  const history = value.map((item) => {
    if (!isRecord(item)
      || Object.keys(item).some((key) => key !== "role" && key !== "content")
      || (item.role !== "user" && item.role !== "assistant")
      || typeof item.content !== "string") {
      throw new AIRequestValidationError();
    }
    const content = item.content.trim();
    if (!content || content.length > AI_HISTORY_ITEM_MAX_LENGTH) throw new AIRequestValidationError();
    totalLength += content.length;
    return { role: item.role as AIHistoryItem["role"], content };
  });
  if (totalLength > AI_HISTORY_MAX_TOTAL_LENGTH) throw new AIRequestValidationError();
  return history;
}

export function parseAIChatRequest(value: unknown): AIChatRequest {
  if (!isRecord(value) || Object.keys(value).some((key) => !REQUEST_KEYS.has(key))) {
    throw new AIRequestValidationError();
  }
  if (typeof value.message !== "string") throw new AIRequestValidationError();
  const message = value.message.trim();
  if (!message || message.length > AI_MESSAGE_MAX_LENGTH) throw new AIRequestValidationError();
  return {
    message,
    selectedContext: parseSelection(value.selectedContext),
    history: parseHistory(value.history),
  };
}
