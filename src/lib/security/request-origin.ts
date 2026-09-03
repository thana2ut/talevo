import type { NextRequest } from "next/server";

type OriginRequest = Pick<NextRequest, "headers" | "nextUrl">;

/**
 * Browser mutations must be same-origin. Requests without Origin are accepted
 * only for non-browser/server callers when explicitly allowed; Fetch Metadata
 * still rejects cross-site and same-site browser requests with a missing Origin.
 */
export function isTrustedMutationOrigin(
  request: OriginRequest,
  options: { allowMissingOrigin?: boolean } = {},
) {
  const origin = request.headers.get("origin");
  if (origin !== null) return origin === request.nextUrl.origin;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "same-origin") return true;
  if (fetchSite !== null) return fetchSite === "none" && options.allowMissingOrigin === true;
  return options.allowMissingOrigin === true;
}
