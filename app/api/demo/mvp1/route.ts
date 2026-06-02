import { NextRequest, NextResponse } from "next/server";
import { listSpacesWithTeamStatus, attachTeamToAllSpaces, ensureTeamAttached } from "@/lib/demo/operations";

function guard(): NextResponse | null {
  if (process.env.ENABLE_DEMO !== "true") {
    return NextResponse.json({ error: "demo disabled (set ENABLE_DEMO=true)" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const g = guard(); if (g) return g;
  try {
    return NextResponse.json({ spaces: await listSpacesWithTeamStatus(), protectedTeamId: process.env.CF_PROTECTED_TEAM_ID });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const g = guard(); if (g) return g;
  try {
    const body = await req.json();
    if (body.action === "attachAll") return NextResponse.json({ results: await attachTeamToAllSpaces() });
    if (body.action === "attachOne") return NextResponse.json({ result: await ensureTeamAttached(body.spaceId) });
    return NextResponse.json({ error: "unknown action" }, { status: 422 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
