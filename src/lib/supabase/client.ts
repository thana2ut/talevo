import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfiguration } from "@/lib/supabase/config";
import { sessionCookieOptions } from "@/lib/supabase/cookie-options";

export function createClient() {
  const { url, publishableKey } = getSupabaseConfiguration();
  return createBrowserClient(url, publishableKey, { cookieOptions: sessionCookieOptions });
}

