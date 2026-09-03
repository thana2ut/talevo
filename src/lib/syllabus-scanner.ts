import { parseWeekday } from "@/lib/timetable/weekday-parser";

export type SourceTrace = { page: number; excerpt: string };
export type ScannedField<T> = { value?: T; confidence: "high" | "needs_review"; sources: SourceTrace[]; issue?: string };
export type SyllabusDraft = {
  courseName: ScannedField<string>;
  courseCode: ScannedField<string>;
  assignments: Array<{ title: string; dueText: string; source: SourceTrace; issue?: string }>;
  exams: Array<{ title: string; dateText: string; source: SourceTrace; issue?: string }>;
  issues: string[];
};

export type SpatialOcrLine = { text: string; x: number; y: number; width: number; height: number; confidence: number; layoutWidth?: number; page?: number };
export type ExtractedDocumentPage = { page: number; text: string; method: "pdf_text" | "ocr"; ocrLines?: SpatialOcrLine[] };
export type LocalReaderProgress = { stage: "prepare" | "reading"; percent?: number };
export type LocalReaderOptions = { signal?: AbortSignal; onProgress?: (value: LocalReaderProgress) => void };
export const supportedSyllabusTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
const TIMETABLE_MAX_PREPROCESS_DIMENSION = 4096;
const MAX_DECODED_IMAGE_PIXELS = 40_000_000;
const MAX_PREPROCESS_PIXELS = 8_500_000;
const MAX_PDF_PAGES = 20;
const MAX_PDF_RENDER_PIXELS = 8_500_000;
const MAX_TOTAL_PDF_RENDER_PIXELS = 34_000_000;
const MAX_OCR_LINES = 10_000;
const OCR_TIMEOUT_MS = 90_000;
const WEEKDAY_COLUMN_RATIO = 0.16;

export function timetablePreprocessDimensions(width: number, height: number) {
  if (width <= 0 || height <= 0) return null;
  const scale = Math.min(2, TIMETABLE_MAX_PREPROCESS_DIMENSION / Math.max(width, height), Math.sqrt(MAX_PREPROCESS_PIXELS / (width * height)));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function weekdayColumnPreprocessDimensions(width: number, height: number) {
  if (width <= 0 || height <= 0) return null;
  const cropWidth = Math.max(1, Math.round(width * WEEKDAY_COLUMN_RATIO));
  const safeScale = Math.min(3, TIMETABLE_MAX_PREPROCESS_DIMENSION / Math.max(cropWidth, height), Math.sqrt(MAX_PREPROCESS_PIXELS / (cropWidth * height)));
  const scale = Math.max(0.25, safeScale);
  return { cropWidth, width: Math.max(1, Math.round(cropWidth * scale)), height: Math.max(1, Math.round(height * scale)), scale };
}

export function needsWeekdayColumnOcr(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const weekdaySignals = new Set(lines.map(parseWeekday).filter((day): day is number => day !== null));
  const courseCodes = new Set(text.match(/\b\d{6,8}\b/gu) ?? []);
  return courseCodes.size >= 2 && weekdaySignals.size < 3;
}

/** A deterministic guard: clean selectable PDF text never enters the OCR path. */
export function needsOcrForPdfPage(text: string) {
  const normalized = text.replace(/\s/g, "");
  if (normalized.length < 24) return true;
  const readable = (normalized.match(/[\p{L}\p{N}]/gu) ?? []).length;
  return readable / normalized.length < 0.55;
}

function spatialLinesFromOcr(blocks: Array<{ bbox: { x0: number; x1: number }; paragraphs: Array<{ lines: Array<{ text: string; confidence: number; bbox: { x0: number; x1: number; y0: number; y1: number } }> }> }> | null) {
  return blocks?.flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines.map((line) => ({
    text: line.text,
    x: line.bbox.x0,
    y: line.bbox.y0,
    width: Math.max(0, line.bbox.x1 - line.bbox.x0),
    height: Math.max(0, line.bbox.y1 - line.bbox.y0),
    confidence: line.confidence,
    layoutWidth: Math.max(0, block.bbox.x1 - block.bbox.x0),
  })))).filter((line) => line.text.trim()).slice(0, MAX_OCR_LINES) ?? [];
}

function clampByte(value: number) { return Math.max(0, Math.min(255, Math.round(value))); }

/** Keeps timetable screenshots local while improving small grid text before OCR. */
async function preprocessTimetableImage(source: File | Blob, signal?: AbortSignal): Promise<{ blob: Blob; scaleX: number; scaleY: number }> {
  if (signal?.aborted) throw new DOMException("OCR cancelled", "AbortError");
  if (typeof createImageBitmap !== "function") return { blob: source, scaleX: 1, scaleY: 1 };
  const bitmap = await createImageBitmap(source);
  try {
    if (bitmap.width * bitmap.height > MAX_DECODED_IMAGE_PIXELS) throw new Error("ภาพมีความละเอียดสูงเกินขีดจำกัดความปลอดภัย กรุณาลดขนาดภาพแล้วลองใหม่");
    const dimensions = timetablePreprocessDimensions(bitmap.width, bitmap.height);
    if (!dimensions) return { blob: source, scaleX: 1, scaleY: 1 };
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width; canvas.height = dimensions.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return { blob: source, scaleX: 1, scaleY: 1 };
    context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);
    if (signal?.aborted) throw new DOMException("OCR cancelled", "AbortError");
    const image = context.getImageData(0, 0, dimensions.width, dimensions.height);
    const sourcePixels = new Uint8ClampedArray(image.data);
    const pixel = (x: number, y: number) => sourcePixels[(y * dimensions.width + x) * 4] * 0.299 + sourcePixels[(y * dimensions.width + x) * 4 + 1] * 0.587 + sourcePixels[(y * dimensions.width + x) * 4 + 2] * 0.114;
    for (let y = 0; y < dimensions.height; y += 1) {
      for (let x = 0; x < dimensions.width; x += 1) {
        const offset = (y * dimensions.width + x) * 4;
        const gray = pixel(x, y);
        const neighbours = [pixel(Math.max(0, x - 1), y), pixel(Math.min(dimensions.width - 1, x + 1), y), pixel(x, Math.max(0, y - 1)), pixel(x, Math.min(dimensions.height - 1, y + 1))];
        const blur = neighbours.reduce((sum, value) => sum + value, 0) / neighbours.length;
        const contrast = (gray - 128) * 1.24 + 128;
        // Mild unsharp masking retains Thai strokes better than a hard threshold.
        const enhanced = contrast + (gray - blur) * 0.42;
        const value = enhanced > 249 ? 255 : enhanced < 7 ? 0 : clampByte(enhanced);
        image.data[offset] = value; image.data[offset + 1] = value; image.data[offset + 2] = value;
      }
    }
    context.putImageData(image, 0, 0);
    const result = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    const scaleX = dimensions.width / bitmap.width; const scaleY = dimensions.height / bitmap.height;
    canvas.width = 1; canvas.height = 1;
    return { blob: result ?? source, scaleX, scaleY };
  } finally {
    bitmap.close();
  }
}

async function preprocessWeekdayColumn(source: File | Blob, signal?: AbortSignal): Promise<{ blob: Blob; scale: number } | null> {
  if (signal?.aborted) throw new DOMException("OCR cancelled", "AbortError");
  if (typeof createImageBitmap !== "function") return null;
  const bitmap = await createImageBitmap(source);
  try {
    const dimensions = weekdayColumnPreprocessDimensions(bitmap.width, bitmap.height);
    if (!dimensions) return null;
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width; canvas.height = dimensions.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, dimensions.cropWidth, bitmap.height, 0, 0, dimensions.width, dimensions.height);
    const image = context.getImageData(0, 0, dimensions.width, dimensions.height);
    for (let offset = 0; offset < image.data.length; offset += 4) {
      const gray = image.data[offset] * 0.299 + image.data[offset + 1] * 0.587 + image.data[offset + 2] * 0.114;
      const contrasted = (gray - 128) * 1.6 + 128;
      const value = contrasted >= 174 ? 255 : 0;
      image.data[offset] = value; image.data[offset + 1] = value; image.data[offset + 2] = value;
    }
    context.putImageData(image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    canvas.width = 1; canvas.height = 1;
    return blob ? { blob, scale: dimensions.scale } : null;
  } finally { bitmap.close(); }
}

async function recognizeImage(source: File | Blob, options: LocalReaderOptions = {}): Promise<{ text: string; lines: SpatialOcrLine[] }> {
  const { createWorker, PSM } = await import("tesseract.js");
  if (options.signal?.aborted) throw new DOMException("OCR cancelled", "AbortError");
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  const cancel = () => { void worker?.terminate(); };
  options.signal?.addEventListener("abort", cancel, { once: true });
  try {
    worker = await createWorker("tha+eng", undefined, { logger: (event) => options.onProgress?.({ stage: "reading", percent: Math.round(event.progress * 100) }) });
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const prepared = await preprocessTimetableImage(source, options.signal);
    const recognize = async (image: Blob) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => { timeoutId = setTimeout(() => reject(new Error("OCR ใช้เวลานานเกินขีดจำกัด กรุณาครอปเฉพาะตารางแล้วลองใหม่")), OCR_TIMEOUT_MS); });
      return Promise.race([worker!.recognize(image, {}, { blocks: true }), timeout]).finally(() => { if (timeoutId) clearTimeout(timeoutId); });
    };
    const result = await recognize(prepared.blob);
    const primaryLines = spatialLinesFromOcr(result.data.blocks);
    if (!needsWeekdayColumnOcr(result.data.text)) return { text: result.data.text, lines: primaryLines };
    const weekdayColumn = await preprocessWeekdayColumn(source, options.signal);
    if (!weekdayColumn) return { text: result.data.text, lines: primaryLines };
    const weekdayResult = await recognize(weekdayColumn.blob);
    const weekdayLines = spatialLinesFromOcr(weekdayResult.data.blocks).map((line) => ({ ...line, x: line.x / weekdayColumn.scale * prepared.scaleX, y: line.y / weekdayColumn.scale * prepared.scaleY, width: line.width / weekdayColumn.scale * prepared.scaleX, height: line.height / weekdayColumn.scale * prepared.scaleY, layoutWidth: line.layoutWidth === undefined ? undefined : line.layoutWidth / weekdayColumn.scale * prepared.scaleX }));
    return { text: [result.data.text, weekdayResult.data.text].filter(Boolean).join("\n"), lines: [...primaryLines, ...weekdayLines] };
  }
  finally { options.signal?.removeEventListener("abort", cancel); await worker?.terminate().catch(() => undefined); }
}

const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const lineSource = (page: number, line: string): SourceTrace => ({ page, excerpt: clean(line).slice(0, 180) });

/**
 * Local-only PDF text extraction. PDFs without an embedded text layer deliberately
 * return no text: TALEVO must not imply that a photograph was read without OCR.
 */
export async function extractPdfPages(file: File): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useWorkerFetch: false });
  const document = await loadingTask.promise;
  if (document.numPages > MAX_PDF_PAGES) { await loadingTask.destroy(); throw new Error(`PDF มี ${document.numPages} หน้า เกินขีดจำกัด ${MAX_PDF_PAGES} หน้า`); }
  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const content = await (await document.getPage(pageNumber)).getTextContent();
      pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
    }
    return pages;
  } finally { await loadingTask.destroy(); }
}

/** Extracts each PDF page in order; only unusable text pages are rendered and OCR'd. */
export async function extractDocumentPages(file: File, options: LocalReaderOptions = {}): Promise<ExtractedDocumentPage[]> {
  options.onProgress?.({ stage: "prepare" });
  if (file.type.startsWith("image/")) {
    const result = await recognizeImage(file, options);
    return [{ page: 1, text: result.text, method: "ocr", ocrLines: result.lines }];
  }
  if (file.type !== "application/pdf") throw new Error("unsupported_file_type");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useWorkerFetch: false });
  const pdfDocument = await loadingTask.promise;
  if (pdfDocument.numPages > MAX_PDF_PAGES) { await loadingTask.destroy(); throw new Error(`PDF มี ${pdfDocument.numPages} หน้า เกินขีดจำกัด ${MAX_PDF_PAGES} หน้า`); }
  const pages: ExtractedDocumentPage[] = [];
  let renderedPixels = 0;
  try { for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    if (options.signal?.aborted) throw new DOMException("OCR cancelled", "AbortError");
    const page = await pdfDocument.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => "str" in item ? item.str : "").join(" ");
    if (!needsOcrForPdfPage(text)) { pages.push({ page: pageNumber, text, method: "pdf_text" }); continue; }
    const viewport = page.getViewport({ scale: 2 });
    const pagePixels = Math.ceil(viewport.width) * Math.ceil(viewport.height);
    renderedPixels += pagePixels;
    if (pagePixels > MAX_PDF_RENDER_PIXELS || renderedPixels > MAX_TOTAL_PDF_RENDER_PIXELS) throw new Error("PDF สแกนมีความละเอียดรวมสูงเกินขีดจำกัด กรุณาแยกเฉพาะหน้าตารางแล้วลองใหม่");
    const canvas = document.createElement("canvas"); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas_unavailable");
    try {
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("pdf_render_failed");
      const result = await recognizeImage(blob, options);
      pages.push({ page: pageNumber, text: result.text, method: "ocr", ocrLines: result.lines });
    } finally {
      canvas.width = 1; canvas.height = 1;
    }
  }
  return pages; } finally { await loadingTask.destroy(); }
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
