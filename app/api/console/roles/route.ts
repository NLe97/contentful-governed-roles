import { NextRequest, NextResponse } from "next/server";
import { authorizeSpaceAccess } from "@/lib/auth/require-request";
import {
  listSpaceRoles, createSpaceRole, updateSpaceRole, deleteSpaceRole,
  assignMemberRole, assignMemberRoleGuarded, listMembersWithProtection, getProtectedUserIds,
} from "@/lib/console/operations";
import { DenyPolicySchema } from "@/lib/policy/types";

export async function GET(req: NextRequest) {
  const spaceId = req.nextUrl.searchParams.get("spaceId");
  if (!spaceId) return NextResponse.json({ error: "spaceId required" }, { status: 422 });
  const auth = await authorizeSpaceAccess(req, spaceId); if ("error" in auth) return auth.error;
  const [roles, members] = await Promise.all([listSpaceRoles(spaceId), listMembersWithProtection(spaceId)]);
  return NextResponse.json({ roles, members });
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  const spaceId = b.spaceId as string;
  if (!spaceId) return NextResponse.json({ error: "spaceId required" }, { status: 422 });
  const auth = await authorizeSpaceAccess(req, spaceId); if ("error" in auth) return auth.error;
  try {
    switch (b.action) {
      case "createRole": {
        const p = DenyPolicySchema.safeParse(b.policy); if (!p.success) return NextResponse.json({ error: p.error.message }, { status: 422 });
        return NextResponse.json({ roleId: await createSpaceRole(spaceId, p.data) });
      }
      case "updateRole": {
        const p = DenyPolicySchema.safeParse(b.policy); if (!p.success) return NextResponse.json({ error: p.error.message }, { status: 422 });
        await updateSpaceRole(spaceId, b.roleId, p.data); return NextResponse.json({ ok: true });
      }
      case "deleteRole":
        await deleteSpaceRole(spaceId, b.roleId); return NextResponse.json({ ok: true });
      case "assign": {
        const ctx = { protectedTeamId: process.env.CF_PROTECTED_TEAM_ID!, orgAdminOwnerUserIds: await getProtectedUserIds() };
        await assignMemberRoleGuarded(b.targetUserId, ctx, () => assignMemberRole(spaceId, b.membershipId, b.roleId));
        return NextResponse.json({ ok: true });
      }
      default: return NextResponse.json({ error: "unknown action" }, { status: 422 });
    }
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
