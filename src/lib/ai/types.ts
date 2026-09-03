export const AI_CONTEXT_KEYS = ["schedule", "tasks", "exams", "grades"] as const;

export type AIContextKey = (typeof AI_CONTEXT_KEYS)[number];

export type AIContextSelection = Record<AIContextKey, boolean>;

export interface AIHistoryItem {
  role: "user" | "assistant";
  content: string;
}

export interface AIChatRequest {
  message: string;
  selectedContext: AIContextSelection;
  history: AIHistoryItem[];
}

export interface AIProviderRequest {
  message: string;
  contextBlock: string;
  history: AIHistoryItem[];
  signal?: AbortSignal;
}

export interface AIProviderResult {
  text: string;
  model: string;
  provider: string;
  operation?: "chat.completions.create" | "interactions.create" | "models.generateContent";
}

export interface AIProviderAdapter {
  readonly id: string;
  isConfigured(): boolean;
  generate(request: AIProviderRequest): Promise<AIProviderResult>;
}

export interface AIChatSuccess {
  message: string;
  model: string;
  attachedContext: AIContextKey[];
  usage: AIUsageStatus;
  debug?: AIProviderDebug;
}

export interface AIProviderDebug {
  provider: "groq" | "gemini" | "local" | "disconnected";
  operation: "chat.completions.create" | "interactions.create" | "models.generateContent" | "local" | "none";
  model: string;
  externalSuccess: boolean;
}

export interface AIUsageStatus {
  limit: number;
  used: number;
  remaining: number;
  cycleStartedAt: string | null;
  resetAt: string | null;
  retryAfterSeconds: number;
  minuteRemaining: number;
  requestInProgress: boolean;
}

export interface AIUsageStatusResponse extends AIUsageStatus {
  providerConfigured: boolean;
  providerId?: "groq" | "gemini" | "disconnected";
  providerLabel?: string;
}

export type AIErrorCode =
  | "AI_BAD_REQUEST"
  | "AI_BUSY"
  | "AI_CANCELLED"
  | "AI_CONFIGURATION_MISSING"
  | "AI_FORBIDDEN"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_PROVIDER_QUOTA"
  | "AI_RATE_LIMIT"
  | "AI_SETUP_REQUIRED"
  | "AI_TIMEOUT"
  | "AI_UNAUTHORIZED";

export interface AIErrorResponse {
  code: AIErrorCode;
  message: string;
  retryAfterSeconds?: number;
  usage?: AIUsageStatus;
  debug?: AIProviderDebug;
}

export const EMPTY_AI_CONTEXT_SELECTION: AIContextSelection = {
  schedule: false,
  tasks: false,
  exams: false,
  grades: false,
};
