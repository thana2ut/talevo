export const MAX_TASK_ATTACHMENTS = 10;
export const MAX_TASK_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_TASK_ATTACHMENTS_TOTAL_BYTES = 50 * 1024 * 1024;
export const TASK_ATTACHMENT_ACCEPT = ".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.zip";

type AttachmentFile = Pick<File, "name" | "type" | "size" | "lastModified">;

const MIME_BY_EXTENSION: Record<string, readonly string[]> = {
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".gif": ["image/gif"],
  ".webp": ["image/webp"],
  ".pdf": ["application/pdf", "application/octet-stream", ""],
  ".txt": ["text/plain", "application/octet-stream", ""],
  ".md": ["text/markdown", "text/plain", "application/octet-stream", ""],
  ".doc": ["application/msword", "application/octet-stream", ""],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/octet-stream", ""],
  ".xls": ["application/vnd.ms-excel", "application/octet-stream", ""],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream", ""],
  ".ppt": ["application/vnd.ms-powerpoint", "application/octet-stream", ""],
  ".pptx": ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/octet-stream", ""],
  ".csv": ["text/csv", "text/plain", "application/vnd.ms-excel", "application/octet-stream", ""],
  ".zip": ["application/zip", "application/x-zip-compressed", "application/octet-stream", ""],
};

function extensionOf(fileName: string) {
  return fileName.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
}

export function isAllowedTaskAttachment(file: AttachmentFile) {
  if (!file.name || file.name.length > 180 || /[\u0000-\u001f\u007f]/.test(file.name)) return false;
  const allowedMimes = MIME_BY_EXTENSION[extensionOf(file.name)];
  return Boolean(allowedMimes?.includes(file.type.trim().toLowerCase()));
}

export function isTaskAttachmentImage(file: Pick<AttachmentFile, "name" | "type">) {
  const extension = extensionOf(file.name);
  return [".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(extension)
    && MIME_BY_EXTENSION[extension]?.includes(file.type.trim().toLowerCase()) === true;
}

export function taskAttachmentSignature(file: Pick<AttachmentFile, "name" | "size" | "lastModified">) {
  return `${file.name}\u0000${file.size}\u0000${file.lastModified}`;
}
