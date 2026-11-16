export function buildContentSecurityPolicy(nonce: string, production: boolean, supabaseUrl: string) {
  const database = new URL(supabaseUrl);
  const websocket = `${database.protocol === "https:" ? "wss:" : "ws:"}//${database.host}`;
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${production ? "" : " 'unsafe-eval'"} https://cdn.jsdelivr.net`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${database.origin} https://lh3.googleusercontent.com`,
    "font-src 'self' data:",
    `connect-src 'self' ${database.origin} ${websocket} https://cdn.jsdelivr.net https://tessdata.projectnaptha.com${production ? "" : " ws://localhost:* ws://127.0.0.1:*"}`,
    "worker-src 'self' blob: https://cdn.jsdelivr.net",
    "media-src 'self' blob:",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    ...(production ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
