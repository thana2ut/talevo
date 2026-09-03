import type { SpatialOcrLine } from "@/lib/syllabus-scanner";
import { normalizeTimetableText } from "@/lib/timetable/text-normalizer";
import type { GeometryColumn, GeometryRow, OcrNode } from "@/lib/timetable/types";

export function adaptOcrLines(lines: SpatialOcrLine[], page = 1): OcrNode[] {
  return lines.filter((line) => normalizeTimetableText(line.text)).map((line, index) => ({
    ...line,
    id: `ocr-${page}-${index + 1}`,
    normalizedText: normalizeTimetableText(line.text),
    centerX: line.x + line.width / 2,
    centerY: line.y + line.height / 2,
    page: line.page ?? page,
  }));
}

function cluster(nodes: OcrNode[], axis: "centerX" | "centerY", tolerance: number) {
  const groups: OcrNode[][] = [];
  for (const node of [...nodes].sort((a, b) => a[axis] - b[axis])) {
    const target = groups.find((group) => Math.abs(group.reduce((sum, item) => sum + item[axis], 0) / group.length - node[axis]) <= tolerance);
    if (target) target.push(node); else groups.push([node]);
  }
  return groups;
}

export function reconstructRows(nodes: OcrNode[]): GeometryRow[] {
  const medianHeight = [...nodes].sort((a, b) => a.height - b.height)[Math.floor(nodes.length / 2)]?.height ?? 16;
  return cluster(nodes, "centerY", Math.max(6, medianHeight * 0.65)).map((group) => ({ centerY: group.reduce((sum, node) => sum + node.centerY, 0) / group.length, nodes: group.sort((a, b) => a.x - b.x) }));
}

export function reconstructColumns(nodes: OcrNode[]): GeometryColumn[] {
  const widths = nodes.map((node) => node.width).filter((width) => width > 0).sort((a, b) => a - b);
  const medianWidth = widths[Math.floor(widths.length / 2)] ?? 40;
  return cluster(nodes, "centerX", Math.max(12, medianWidth * 0.55)).map((group) => ({ centerX: group.reduce((sum, node) => sum + node.centerX, 0) / group.length, nodes: group.sort((a, b) => a.y - b.y) }));
}

export function rectangularGeometryScore(nodes: OcrNode[]) {
  if (nodes.length < 8) return 0;
  const rows = reconstructRows(nodes); const columns = reconstructColumns(nodes);
  return rows.length >= 4 && columns.length >= 4 ? 1 : 0;
}
