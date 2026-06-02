import { NextRequest, NextResponse } from "next/server";
import {
  getGovernedStatus, applyGovernedRole, removeGovernedRole,
  listMembersWithProtection, listContentTypes, listRoles, addUser, removeUser,
  applyGovernedToAllSpaces, removeGovernedFromAllSpaces,
} from "@/lib/console/operations";
import { authorizeOrgAdmin } from "@/lib/auth/require-request";

export async function GET(req: NextRequest) {
  const auth = await authorizeOrgAdmin(req); if ("error" in auth) return auth.error;
  const spaceId = req.nextUrl.searchParams.get("spaceId");
  if (!spaceId) return NextResponse.json({ error: "spaceId required" }, { status: 422 });
  try {
    const [governed, members, contentTypes, roles] = await Promise.all([
      getGovernedStatus(spaceId), listMembersWithProtection(spaceId), listContentTypes(spaceId), listRoles(spaceId),
    ]);
    return NextResponse.json({ governed, members, contentTypes, roles });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorizeOrgAdmin(req); if ("error" in auth) return auth.error;
  try {
    const b = await req.json();
    switch (b.action) {
      case "applyGoverned": return NextResponse.json(await applyGovernedRole(b.spaceId, b.contentTypeId, b.denyAction ?? "edit"));
      case "removeGoverned": return NextResponse.json(await removeGovernedRole(b.spaceId));
      case "addUser": return NextResponse.json(await addUser(b.spaceId, b.email, b.roleId));
      case "removeUser": return NextResponse.json(await removeUser(b.spaceId, b.membershipId));
      case "applyGovernedAll": return NextResponse.json(await applyGovernedToAllSpaces(b.contentTypeId || "post", b.denyAction ?? "edit"));
      case "removeGovernedAll": return NextResponse.json(await removeGovernedFromAllSpaces());
      default: return NextResponse.json({ error: "unknown action" }, { status: 422 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
