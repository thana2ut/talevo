import { z } from "zod";
import { isSafeJSON } from "@/lib/security/payload";
import { VISION_FIELDS, type VisionItem } from "@/lib/vision";

const timestamp = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const evidence = z.object({ imageId: z.string().max(100), imageNumber: z.number().int().positive(), text: z.string().max(16000) }).strict();
const fact = z.object({ value: z.string().max(16000).nullable(), evidence: z.array(evidence).max(100) }).strict();
const visionFacts = z.object(Object.fromEntries(VISION_FIELDS.map(key => [key, fact])) as Record<typeof VISION_FIELDS[number], typeof fact>).strict();
const visionItem = z.object({
  id: z.string().min(1).max(100), kind: z.enum(["task", "exam", "announcement", "material", "review"]),
  facts: visionFacts,
  sources: z.array(z.string().max(100)).max(100), issues: z.array(z.string().max(500)).max(100),
  conflicts: z.array(z.enum(VISION_FIELDS)).max(VISION_FIELDS.length), selected: z.boolean(), reviewed: z.boolean(),
  courseId: z.string().max(100), choice: z.enum(["create", "skip", "update"]), targetId: z.string().max(100),
}).strict();
const visionImage = z.object({
  id: z.string().min(1).max(100), number: z.number().int().positive(), name: z.string().max(200), blob: z.instanceof(Blob),
  digest: z.string().max(128), state: z.enum(["queued", "reading", "done", "error"]), error: z.string().max(1000).optional(),
  items: z.array(visionItem).max(80),
}).strict();
const visionSession = z.object({
  schemaVersion: z.literal(1), owner: z.string().min(1).max(200), expires: timestamp,
  images: z.array(visionImage).max(100), items: z.array(visionItem).max(500), savedIds: z.array(z.string().max(100)).max(500),
}).strict();
const ownerBinding = z.object({ version: z.literal(1), userId: z.string().min(1).max(200) }).strict();

export function parseVisionSession(value: unknown, expectedOwner: string, now = Date.now()) {
  if (!isSafeJSON(value, 100_000)) return null;
  // Version 0 stored the same fields without a version marker. Migrate in
  // memory, then validate; never overwrite or delete an unreadable original.
  const candidate = value && typeof value === "object" && !("schemaVersion" in value)
    ? { ...value, schemaVersion: LOCAL_DATA_SCHEMA_VERSION }
    : value;
  const parsed = visionSession.safeParse(candidate);
  if (!parsed.success || parsed.data.owner !== expectedOwner || parsed.data.expires <= now) return null;
  return parsed.data as unknown as VisionSession;
}

export function parseLocalOwnerBinding(value: unknown) {
  if (!isSafeJSON(value, 100)) return null;
  const parsed = ownerBinding.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export const LOCAL_DATA_SCHEMA_VERSION = 1;
type VisionSession = { schemaVersion: 1; owner: string; expires: number; images: (Omit<z.infer<typeof visionImage>, "items"> & { items: VisionItem[] })[]; items: VisionItem[]; savedIds: string[] };
