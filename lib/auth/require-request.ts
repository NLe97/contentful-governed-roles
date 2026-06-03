import { NextRequest, NextResponse } from "next/server";
import { resolveIdentity } from "@/lib/contentful/oauth";
import { requireOrgAdmin } from "@/lib/auth/authorize";
import type { Identity } from "@/lib/auth/identity";
import { canAccessSpace, canInvite } from "@/lib/auth/space-access";
import { getSpaceAccessConfig } from "@/lib/governance/store";
import { isBuiltinSpaceAdmin } from "@/lib/console/operations";

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

async function resolveCaller(req: NextRequest): Promise<Identity | NextResponse> {
  const token = req.cookies.get("cf_user_token")?.value;
  if (!token) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  try { return await resolveIdentity(token, process.env.CF_ORG_ID!); }
  catch { return NextResponse.json({ error: "invalid session" }, { status: 401 }); }
}

export async function authorizeSpaceAccess(req: NextRequest, spaceId: string): Promise<{ identity: Identity; privileged: boolean } | { error: NextResponse }> {
  const idOrErr = await resolveCaller(req);
  if (idOrErr instanceof NextResponse) return { error: idOrErr };
  const identity = idOrErr;
  if (identity.isOrgAdmin) return { identity, privileged: true };
  const [cfg, builtin] = await Promise.all([getSpaceAccessConfig(spaceId), isBuiltinSpaceAdmin(spaceId, identity.userId)]);
  const ok = canAccessSpace(identity, cfg, builtin);
  if (ok) return { identity, privileged: builtin };
  return { error: NextResponse.json({ error: "no access to this space" }, { status: 403 }) };
}

export async function authorizeInviter(req: NextRequest, spaceId: string): Promise<{ identity: Identity } | { error: NextResponse }> {
  const idOrErr = await resolveCaller(req);
  if (idOrErr instanceof NextResponse) return { error: idOrErr };
  const identity = idOrErr;
  if (identity.isOrgAdmin) return { identity };
  const [cfg, builtin] = await Promise.all([getSpaceAccessConfig(spaceId), isBuiltinSpaceAdmin(spaceId, identity.userId)]);
  if (canInvite(identity, cfg, builtin)) return { identity };
  return { error: NextResponse.json({ error: "cannot invite to this space" }, { status: 403 }) };
}
