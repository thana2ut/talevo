import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfiguration } from "@/lib/supabase/config";

export function createAdminClient() {
  const adminSecretKey = process.env.SUPABASE_SECRET_KEY?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!adminSecretKey) return null;
  const { url } = getSupabaseConfiguration();
  return createSupabaseClient(url, adminSecretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
