import "server-only";

export const MAX_SYLLABUS_DOCUMENT_BYTES = 6 * 1024 * 1024;
export const MAX_SYLLABUS_MULTIPART_BYTES = MAX_SYLLABUS_DOCUMENT_BYTES + 256 * 1024;
export const SYLLABUS_DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function normalizeSyllabusMimeType(fileName: string, mimeType: string) {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized === "image/jpg" || /\.jpe?g$/i.test(fileName) && (!normalized || normalized === "application/octet-stream")) {
    return "image/jpeg";
  }
  return normalized;
}

export function hasAllowedSyllabusFileExtension(fileName: string, mimeType: string) {
  if (!fileName || fileName.length > 180 || /[\u0000-\u001f\u007f]/.test(fileName)) return false;
  const extension = fileName.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  if (mimeType === "application/pdf") return extension === ".pdf";
  if (mimeType === "image/jpeg") return extension === ".jpg" || extension === ".jpeg";
  if (mimeType === "image/png") return extension === ".png";
  if (mimeType === "image/webp") return extension === ".webp";
  return false;
}

export function matchesSyllabusDocumentMagic(mimeType: string, bytes: Uint8Array) {
  if (mimeType === "application/pdf") {
    return bytes.length >= 5 && new TextDecoder("ascii").decode(bytes.subarray(0, 5)) === "%PDF-";
  }
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
  }
  if (mimeType === "image/webp") {
    return bytes.length >= 12
      && new TextDecoder("ascii").decode(bytes.subarray(0, 4)) === "RIFF"
      && new TextDecoder("ascii").decode(bytes.subarray(8, 12)) === "WEBP";
  }
  return false;
}

export function bytesToBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}
