const AUTH_CALLBACK_DESTINATIONS = new Set(["/today", "/reset-password"]);

export function getSafeInternalPath(value: string | null | undefined, fallback: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  try {
    const parsed = new URL(value, "https://talevo.local");
    if (parsed.origin !== "https://talevo.local") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function getSafeAuthCallbackDestination(value: string | null | undefined, fallback: "/today" | "/reset-password") {
  const destination = getSafeInternalPath(value, fallback);
  return AUTH_CALLBACK_DESTINATIONS.has(destination) ? destination : fallback;
}
