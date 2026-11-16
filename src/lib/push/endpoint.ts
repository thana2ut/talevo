// Shared by registration and dispatch, so legacy rows are checked before egress.
export function isTrustedPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    if (value.length > 1000 || url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return false;
    if (url.hostname === "fcm.googleapis.com") return /^\/fcm\/send\/[\w:.-]+$/.test(url.pathname);
    if (url.hostname === "updates.push.services.mozilla.com") return /^\/wpush\/v[12]\/[\w-]+$/.test(url.pathname);
    if (url.hostname === "web.push.apple.com") return /^\/[\w/-]+$/.test(url.pathname);
    if (/^(?:[a-z0-9-]+\.)?notify\.windows\.com$/.test(url.hostname)) return url.pathname.startsWith("/w/");
    return false;
  } catch { return false; }
}
