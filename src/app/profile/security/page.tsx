import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccountSecurity } from "@/features/profile/account-security";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "ความปลอดภัยบัญชี", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const db = await createClient();
  const { data: auth, error } = await db.auth.getUser();
  if (error || !auth.user) redirect("/login");
  const factor = auth.user.factors?.find(item => item.factor_type === "totp" && item.status === "verified");
  const { data: admin } = await db.rpc("is_support_admin");
  if (admin !== true && !factor) notFound();
  const { data: assurance, error: assuranceError } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
  return <AccountSecurity canManageSupport={admin === true} verifiedFactorId={factor?.id ?? null} verifiedSession={!assuranceError && assurance?.currentLevel === "aal2"} />;
}
