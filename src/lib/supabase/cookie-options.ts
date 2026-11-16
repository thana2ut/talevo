// Supabase's browser data client needs JS-readable session cookies. HttpOnly
// requires moving ALL browser data/auth calls behind a BFF; see the runbook.
export const sessionCookieOptions = {
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};
