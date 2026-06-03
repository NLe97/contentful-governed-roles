import { NextRequest, NextResponse } from "next/server";
import { resolveIdentity } from "@/lib/contentful/oauth";
import { resolvePersona, type SpaceAccessInfo } from "@/lib/console/persona";
import { getSpaceAccessConfig } from "@/lib/governance/store";
import { canAccessSpace, canInvite } from "@/lib/auth/space-access";
import { listSpacesWithTeamStatus, listBuiltinAdmins } from "@/lib/console/operations";
import { pmap } from "@/lib/cma/rest";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("cf_user_token")?.value;
  if (!token) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  let identity;
  try { identity = await resolveIdentity(token, process.env.CF_ORG_ID!); }
  catch { return NextResponse.json({ error: "invalid session" }, { status: 401 }); }

  const spaces = await listSpacesWithTeamStatus();
  const access: SpaceAccessInfo[] = await pmap(spaces, async (s) => {
    if (identity!.isOrgAdmin) return { spaceId: s.spaceId, isAdmin: true, isInviter: true };
    const [cfg, admins] = await Promise.all([getSpaceAccessConfig(s.spaceId), listBuiltinAdmins(s.spaceId)]);
    const builtin = admins.includes(identity!.userId);
    return { spaceId: s.spaceId, isAdmin: canAccessSpace(identity!, cfg, builtin), isInviter: canInvite(identity!, cfg, builtin) };
  }, 6);

  const persona = resolvePersona(identity, access);
  const named = spaces.map((s) => ({ spaceId: s.spaceId, spaceName: s.spaceName }));
  return NextResponse.json({ identity, ...persona, spaces: named });
}
