import { NextRequest, NextResponse } from "next/server";
import {
  getGovernedStatus, applyGovernedRole, removeGovernedRole,
  listMembersWithProtection, listContentTypes, listRoles, addUser, removeUser,
  applyGovernedToAllSpaces, removeGovernedFromAllSpaces,
} from "@/lib/demo/operations";

function guard(): NextResponse | null {
  if (process.env.ENABLE_DEMO !== "true") {
    return NextResponse.json({ error: "demo disabled (set ENABLE_DEMO=true)" }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const g = guard(); if (g) return g;
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
  const g = guard(); if (g) return g;
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
