export type SourceTrace = { page: number; excerpt: string };
export type ScannedField<T> = { value?: T; confidence: "high" | "needs_review"; sources: SourceTrace[]; issue?: string };
export type SyllabusDraft = {
  courseName: ScannedField<string>;
  courseCode: ScannedField<string>;
  assignments: Array<{ title: string; dueText: string; source: SourceTrace; issue?: string }>;
  exams: Array<{ title: string; dateText: string; source: SourceTrace; issue?: string }>;
  issues: string[];
};

export type ExtractedDocumentPage = { page: number; text: string; method: "pdf_text" | "ocr" };
export const supportedSyllabusTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;

/** A deterministic guard: clean selectable PDF text never enters the OCR path. */
export function needsOcrForPdfPage(text: string) {
  const normalized = text.replace(/\s/g, "");
  if (normalized.length < 24) return true;
  const readable = (normalized.match(/[\p{L}\p{N}]/gu) ?? []).length;
  return readable / normalized.length < 0.55;
}

async function recognizeImage(source: File | Blob): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("tha+eng");
  try { return (await worker.recognize(source)).data.text; } finally { await worker.terminate(); }
}

const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const lineSource = (page: number, line: string): SourceTrace => ({ page, excerpt: clean(line).slice(0, 180) });

/**
 * Local-only PDF text extraction. PDFs without an embedded text layer deliberately
 * return no text: TALEVO must not imply that a photograph was read without OCR.
 */
export async function extractPdfPages(file: File): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useWorkerFetch: false }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const content = await (await document.getPage(pageNumber)).getTextContent();
    pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
  }
  return pages;
}

/** Extracts each PDF page in order; only unusable text pages are rendered and OCR'd. */
export async function extractDocumentPages(file: File): Promise<ExtractedDocumentPage[]> {
  if (file.type.startsWith("image/")) return [{ page: 1, text: await recognizeImage(file), method: "ocr" }];
  if (file.type !== "application/pdf") throw new Error("unsupported_file_type");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfDocument = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useWorkerFetch: false }).promise;
  const pages: ExtractedDocumentPage[] = [];
  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => "str" in item ? item.str : "").join(" ");
    if (!needsOcrForPdfPage(text)) { pages.push({ page: pageNumber, text, method: "pdf_text" }); continue; }
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas"); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas_unavailable");
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("pdf_render_failed");
    pages.push({ page: pageNumber, text: await recognizeImage(blob), method: "ocr" });
  }
  return pages;
}

export function extractSyllabusDraftFromDocument(pages: ExtractedDocumentPage[]) {
  return extractSyllabusDraft(pages.map((page) => page.text));
}

export function extractSyllabusDraft(pages: string[]): SyllabusDraft {
  const result: SyllabusDraft = { courseName: { confidence: "needs_review", sources: [] }, courseCode: { confidence: "needs_review", sources: [] }, assignments: [], exams: [], issues: [] };
  pages.forEach((text, index) => {
    const page = index + 1;
    const lines = text.split(/\n|(?<=[.!?])\s+/).map(clean).filter(Boolean);
    lines.forEach((line) => {
      const code = line.match(/(?:course\s*code|รหัสวิชา)\s*[:\-]?\s*([A-Z]{2,}\s*\d{3,})/i);
      if (code && !result.courseCode.value) result.courseCode = { value: clean(code[1]), confidence: "high", sources: [lineSource(page, line)] };
      const name = line.match(/(?:course\s*(?:title|name)|ชื่อวิชา)\s*[:\-]?\s*(.{3,})/i);
      if (name && !result.courseName.value) result.courseName = { value: clean(name[1]), confidence: "high", sources: [lineSource(page, line)] };
      if (/\b(?:assignment|project|homework|งาน)\b/i.test(line)) {
        const due = line.match(/(?:due|ส่ง|deadline)\s*[:\-]?\s*(.+)$/i);
        result.assignments.push({ title: line, dueText: due ? clean(due[1]) : "", source: lineSource(page, line), ...(due ? {} : { issue: "ไม่พบวันส่งที่ระบุชัดเจน" }) });
      }
      if (/\b(?:midterm|final|quiz|exam|สอบ)\b/i.test(line)) {
        const date = line.match(/(?:date|วันที่|สอบ)\s*[:\-]?\s*(.+)$/i);
        result.exams.push({ title: line, dateText: date ? clean(date[1]) : "", source: lineSource(page, line), ...(date ? {} : { issue: "ไม่พบวันสอบที่ระบุชัดเจน" }) });
      }
    });
  });
  if (!pages.join(" ").trim()) result.issues.push("ระบบไม่พบข้อความที่อ่านได้จากเอกสาร แม้ลองอ่านข้อความและ OCR แล้ว จึงไม่สร้างข้อมูลจากการเดา");
  if (!result.courseName.value) result.issues.push("ไม่พบชื่อวิชาที่ระบุชัดเจน");
  if (!result.courseCode.value) result.issues.push("ไม่พบรหัสวิชาที่ระบุชัดเจน");
  return result;
}
