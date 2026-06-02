import { NextRequest, NextResponse } from "next/server";
import { handleMemberAction } from "./logic";
import { resolveIdentity } from "@/lib/contentful/oauth";
import { getSpaceGovernance, appendAudit } from "@/lib/governance/store";
import { addMember, deleteMembership, listMembers } from "@/lib/cma/memberships";
import { getProtectedUserIds } from "@/lib/governance/protected-set";

export async function POST(req: NextRequest) {
  const token = req.cookies.get("cf_user_token")?.value;
  if (!token) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const body = await req.json();
  let identity: Awaited<ReturnType<typeof resolveIdentity>>;
  try {
    identity = await resolveIdentity(token, process.env.CF_ORG_ID!);
  } catch {
    return NextResponse.json({ error: "invalid session" }, { status: 401 });
  }
  const gov = await getSpaceGovernance(body.spaceId);
  if (!gov) return NextResponse.json({ error: "space not governed" }, { status: 404 });
  const ctx = {
    protectedTeamId: process.env.CF_PROTECTED_TEAM_ID!,
    orgAdminOwnerUserIds: await getProtectedUserIds(process.env.CF_ORG_ID!),
  };
  const result = await handleMemberAction({
    identity, gov, ctx, action: body.action, email: body.email,
    targetUserId: body.targetUserId, membershipId: body.membershipId,
    deps: { addMember, removeMembership: deleteMembership, listMembers, appendAudit },
  });
  return NextResponse.json(result.body, { status: result.status });
}
