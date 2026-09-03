import { NextResponse, type NextRequest } from "next/server";
import { runSyllabusLayerProbe } from "@/lib/ai/syllabus-probe";
import { isTrustedMutationOrigin } from "@/lib/security/request-origin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") return new NextResponse(null, { status: 404 });
  if (!isTrustedMutationOrigin(request, { allowMissingOrigin: true })) return NextResponse.json({ code: "PROBE_FORBIDDEN" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return NextResponse.json({ code: "PROBE_UNAUTHORIZED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const result = await runSyllabusLayerProbe();
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ code: "PROBE_INTERNAL_ERROR" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
