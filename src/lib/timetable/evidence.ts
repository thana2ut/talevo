import type { SpatialOcrLine } from "@/lib/syllabus-scanner";
import { normalizeTimetableText } from "@/lib/timetable/text-normalizer";
import type { TimetableTextEvidence } from "@/lib/timetable/types";

/**
 * Stage A: Raw Document Evidence Extraction.
 * Preserves all source text, coordinates, bounding box geometry, and confidence.
 * Deliberately performs NO premature classification into course records.
 */
export function extractDocumentEvidence(lines: SpatialOcrLine[]): TimetableTextEvidence[] {
  return lines.map((line, index) => {
    const page = line.page ?? 1;
    const rawText = line.text;
    const normalizedText = normalizeTimetableText(rawText);
    const x = line.x;
    const y = line.y;
    const width = line.width;
    const height = line.height;
    return {
      id: `evidence-p${page}-${index + 1}`,
      rawText,
      normalizedText,
      x,
      y,
      width,
      height,
      centerX: x + width / 2,
      centerY: y + height / 2,
      page,
      confidence: line.confidence ?? 90,
      layoutWidth: line.layoutWidth,
    };
  });
}

/**
 * Proves whether a query string or course code exists in the raw evidence stage.
 */
export function findEvidenceForCode(evidence: TimetableTextEvidence[], queryCode: string): TimetableTextEvidence[] {
  const query = normalizeTimetableText(queryCode).trim();
  if (!query) return [];
  return evidence.filter((item) => item.normalizedText.includes(query) || item.rawText.includes(query));
}
