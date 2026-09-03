const missingConfigurationMessage = "ยังไม่ได้ตั้งค่าการเชื่อมต่อ Supabase สำหรับ TALEVO";

export function getSupabaseConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(missingConfigurationMessage);
  }

  return { url, publishableKey };
}

