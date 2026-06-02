import { NextRequest, NextResponse } from "next/server";
import { listSpacesWithTeamStatus, attachTeamToAllSpaces, ensureTeamAttached } from "@/lib/console/operations";
import { authorizeOrgAdmin } from "@/lib/auth/require-request";

export async function GET(req: NextRequest) {
  const auth = await authorizeOrgAdmin(req); if ("error" in auth) return auth.error;
  try {
    return NextResponse.json({ spaces: await listSpacesWithTeamStatus(), protectedTeamId: process.env.CF_PROTECTED_TEAM_ID });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorizeOrgAdmin(req); if ("error" in auth) return auth.error;
  try {
    const body = await req.json();
    if (body.action === "attachAll") return NextResponse.json({ results: await attachTeamToAllSpaces() });
    if (body.action === "attachOne") return NextResponse.json({ result: await ensureTeamAttached(body.spaceId) });
    return NextResponse.json({ error: "unknown action" }, { status: 422 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
