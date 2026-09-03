import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { TALEVO_AI_MODEL } from "@/lib/ai/config";
import { getSafeGeminiClientDiagnostics } from "@/lib/ai/gemini-client";
import {
  SYLLABUS_RESPONSE_JSON_SCHEMA,
  SYLLABUS_SYSTEM_INSTRUCTION,
  type SafeSyllabusProviderError,
} from "@/lib/ai/syllabus-extractor";
import { matchesSyllabusDocumentMagic } from "@/lib/ai/syllabus-upload";

export type SyllabusProbeLevel = "I-A" | "I-B" | "I-C" | "I-D";
export type SyllabusProbeResult = {
  level: SyllabusProbeLevel;
  ok: boolean;
  provider: SafeSyllabusProviderError;
  responseCategory: "accepted" | "provider-error" | "response-invalid" | "timeout";
};

const minimalSchema = {
  type: "object",
  properties: { ok: { type: "boolean" } },
  required: ["ok"],
  additionalProperties: false,
} as const;

const supportedSchemaKeywords = new Set([
  "$id", "$defs", "$ref", "$anchor", "type", "format", "title", "description", "enum",
  "items", "prefixItems", "minItems", "maxItems", "minimum", "maximum", "anyOf", "oneOf",
  "properties", "additionalProperties", "required", "propertyOrdering",
]);

export function auditSyllabusResponseSchema(value: unknown) {
  const issues: string[] = [];
  const visit = (node: unknown, jsonPath: string) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    const record = node as Record<string, unknown>;
    for (const [keyword, child] of Object.entries(record)) {
      if (!supportedSchemaKeywords.has(keyword)) issues.push(`${jsonPath}.${keyword}`);
      if (keyword === "properties" || keyword === "$defs") {
        if (!child || typeof child !== "object" || Array.isArray(child)) {
          issues.push(`${jsonPath}.${keyword}`);
        } else {
          for (const [name, schema] of Object.entries(child as Record<string, unknown>)) visit(schema, `${jsonPath}.${keyword}.${name}`);
        }
      } else if (keyword === "items" || keyword === "additionalProperties") {
        if (typeof child !== "boolean") visit(child, `${jsonPath}.${keyword}`);
      } else if (keyword === "anyOf" || keyword === "oneOf" || keyword === "prefixItems") {
        if (Array.isArray(child)) child.forEach((schema, index) => visit(schema, `${jsonPath}.${keyword}[${index}]`));
      }
    }
    if (Array.isArray(record.required) && record.properties && typeof record.properties === "object") {
      for (const requiredName of record.required) {
        if (typeof requiredName !== "string" || !(requiredName in (record.properties as Record<string, unknown>))) issues.push(`${jsonPath}.required:${String(requiredName)}`);
      }
    }
  };
  visit(value, "$");
  return issues;
}

export function buildSyllabusProbeRequest(level: SyllabusProbeLevel, imageBase64: string) {
  if (level === "I-A") {
    return { model: TALEVO_AI_MODEL, input: "Reply only OK", store: false as const };
  }
  const input = [
    {
      type: "text" as const,
      text: level === "I-B"
        ? "Reply only OK if you can read the image."
        : level === "I-C"
          ? "Return exactly a JSON object with ok set to true."
          : "Return an empty syllabus extraction with course fields set to null and all list fields empty.",
    },
    { type: "image" as const, data: imageBase64, mime_type: "image/jpeg" as const },
  ];
  if (level === "I-B") return { model: TALEVO_AI_MODEL, input, store: false as const };
  if (level === "I-C") {
    return {
      model: TALEVO_AI_MODEL,
      input,
      response_format: { type: "text" as const, mime_type: "application/json" as const, schema: minimalSchema },
      store: false as const,
    };
  }
  return {
    model: TALEVO_AI_MODEL,
    input,
    response_format: { type: "text" as const, mime_type: "application/json" as const, schema: SYLLABUS_RESPONSE_JSON_SCHEMA },
    system_instruction: SYLLABUS_SYSTEM_INSTRUCTION,
    store: false as const,
  };
}

export async function runSyllabusLayerProbe() {
  const fixturePath = path.join(process.cwd(), "scripts", "fixtures", "syllabus-probe.jpg");
  const fixtureBytes = await readFile(fixturePath);
  if (!matchesSyllabusDocumentMagic("image/jpeg", fixtureBytes)) throw new Error("Invalid syllabus JPEG probe fixture");
  const results: SyllabusProbeResult[] = [];

  const diagnostics = {
    ...getSafeGeminiClientDiagnostics(),
    model: TALEVO_AI_MODEL,
    operation: "none" as const,
  };
  return {
    diagnostics,
    fixture: { mimeType: "image/jpeg", size: fixtureBytes.length, magicBytesValid: true, rawBase64: true },
    schemaAudit: auditSyllabusResponseSchema(SYLLABUS_RESPONSE_JSON_SCHEMA),
    results,
  };
}
