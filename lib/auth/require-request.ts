import { NextRequest, NextResponse } from "next/server";
import { resolveIdentity } from "@/lib/contentful/oauth";
import { requireOrgAdmin } from "@/lib/auth/authorize";
import type { Identity } from "@/lib/auth/identity";

// Resolve the caller from the Contentful OAuth cookie and require Org Admin/Owner.
// Returns either the identity or a ready-to-return error response.
// (Locally you can set the cf_user_token cookie to a PAT held by an org admin.)
export async function authorizeOrgAdmin(req: NextRequest): Promise<{ identity: Identity } | { error: NextResponse }> {
  const token = req.cookies.get("cf_user_token")?.value;
  if (!token) return { error: NextResponse.json({ error: "not signed in" }, { status: 401 }) };
  let identity: Identity;
  try {
    identity = await resolveIdentity(token, process.env.CF_ORG_ID!);
  } catch {
    return { error: NextResponse.json({ error: "invalid session" }, { status: 401 }) };
  }
  try {
    requireOrgAdmin(identity);
  } catch {
    return { error: NextResponse.json({ error: "org admin required" }, { status: 403 }) };
  }
  return { identity };
}
