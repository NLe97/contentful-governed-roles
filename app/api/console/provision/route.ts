import { NextRequest, NextResponse } from "next/server";
import { authorizeOrgAdmin } from "@/lib/auth/require-request";
import { ensureContentModel } from "@/lib/governance/content-model";

// Org-Admin gated: provision the governance content model from inside the app, so a
// fresh deployment can be set up entirely from the browser (no local CLI / clone).
// Idempotent — creates missing content types and back-fills missing fields.
export async function POST(req: NextRequest) {
  const auth = await authorizeOrgAdmin(req); if ("error" in auth) return auth.error;
  try {
    await ensureContentModel();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
