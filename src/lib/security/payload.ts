import { z } from "zod";

// Bound traversal before schema validation, including deeply nested JSON.
export function isSafeJSON(value: unknown, maxNodes = 50_000): boolean {
  const pending = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const entry = pending.pop()!;
    if (++nodes > maxNodes || entry.depth > 24) return false;
    const item = entry.value;
    if (typeof item === "number" && !Number.isFinite(item)) return false;
    if (typeof item === "string" && item.length > 3_500_000) return false;
    if (item && typeof item === "object") {
      for (const [key, child] of Object.entries(item)) {
        if (["__proto__", "prototype", "constructor"].includes(key)) return false;
        pending.push({ value: child, depth: entry.depth + 1 });
      }
    }
  }
  return true;
}

const record = z.record(z.string(), z.unknown());
const id = z.string().min(1).max(100);
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const apiPayloadSchemas = {
  chat: z.object({ message: z.string().trim().min(1).max(8000), selectedContext: record.optional(), history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }).strict()).max(6).optional() }).strict(),
  voice: z.object({ entity: z.enum(["task", "exam", "schedule"]), action: z.enum(["create", "update", "delete"]), id, summary: z.string().trim().min(1).max(500), fields: record.optional() }).strict(),
  visionImport: z.object({ items: z.array(record).min(1).max(100), confirmUpdates: z.boolean().optional() }).strict(),
  grade: z.discriminatedUnion("operation", [
    z.object({ operation: z.literal("settings"), revision, settings: record }).strict(),
    z.object({ operation: z.enum(["save", "delete"]), course: record }).strict(),
  ]),
  rescue: z.object({ operation: z.enum(["plan", "save"]), preferences: record, plan: record.optional(), revision: revision.optional() }).strict(),
  push: z.object({ endpoint: z.string().min(1).max(1000), keys: z.object({ p256dh: z.string().min(1).max(255), auth: z.string().min(1).max(255) }).strict() }).strict(),
  pushDelete: z.object({ endpoint: z.string().min(1).max(1000) }).strict(),
};
