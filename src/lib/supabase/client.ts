import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfiguration } from "@/lib/supabase/config";

export function createClient() {
  const { url, publishableKey } = getSupabaseConfiguration();
  return createBrowserClient(url, publishableKey);
}

