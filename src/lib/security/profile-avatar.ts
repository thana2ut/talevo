/** Stored references are never fetched as arbitrary external URLs. */
export function profileAvatarPath(reference: string, supabaseUrl: string, ownerId?: string): string | null {
  try {
    const database = new URL(supabaseUrl);
    let path: string;
    if (reference.startsWith("/api/profile/avatar?")) {
      path = new URL(reference, "https://talevo.invalid").searchParams.get("path") ?? "";
    } else {
      const url = new URL(reference);
      const prefix = "/storage/v1/object/public/profile-avatars/";
      if (url.origin !== database.origin || !url.pathname.startsWith(prefix)) return null;
      path = decodeURIComponent(url.pathname.slice(prefix.length));
    }
    // Exactly one owner folder and a supported image. No traversal or URLs.
    const match = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(avatar-[0-9a-f-]{36}\.(?:webp|jpg))$/i.exec(path);
    if (!match || (ownerId && match[1].toLowerCase() !== ownerId.toLowerCase())) return null;
    return path;
  } catch { return null; }
}

export function privateProfileAvatarUrl(path: string) {
  return `/api/profile/avatar?path=${encodeURIComponent(path)}`;
}
