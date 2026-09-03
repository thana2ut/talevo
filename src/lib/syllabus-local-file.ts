const signatures: Record<string, number[]> = {
  "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d],
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [137, 80, 78, 71, 13, 10, 26, 10],
};

export async function hasLocalSyllabusFileMagic(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (file.type === "image/webp") return bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  const signature = signatures[file.type];
  return Boolean(signature && signature.every((value, index) => bytes[index] === value));
}
