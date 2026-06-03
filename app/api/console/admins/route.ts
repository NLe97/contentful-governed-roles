import { NextRequest, NextResponse } from "next/server";
import { authorizeOrgAdmin } from "@/lib/auth/require-request";
import { getSpaceAccessConfig, setSpaceAccessConfig } from "@/lib/governance/store";
import { listBuiltinAdmins, listSpacesWithTeamStatus } from "@/lib/console/operations";

export async function GET(req: NextRequest) {
  const auth = await authorizeOrgAdmin(req); if ("error" in auth) return auth.error;
  const spaceId = req.nextUrl.searchParams.get("spaceId");
  if (!spaceId) return NextResponse.json({ error: "spaceId required" }, { status: 422 });
  return NextResponse.json({ config: await getSpaceAccessConfig(spaceId), builtinAdmins: await listBuiltinAdmins(spaceId) });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeOrgAdmin(req); if ("error" in auth) return auth.error;
  const b = await req.json();
  try {
    if (b.action === "setLists") {
      await setSpaceAccessConfig(b.spaceId, b.spaceName ?? b.spaceId, { adminUserIds: b.adminUserIds, inviterUserIds: b.inviterUserIds });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "seedAll") {
      const spaces = await listSpacesWithTeamStatus();
      const results = [];
      for (const s of spaces) {
        const admins = await listBuiltinAdmins(s.spaceId);
        const cur = await getSpaceAccessConfig(s.spaceId);
        const merged = Array.from(new Set([...cur.adminUserIds, ...admins]));
        await setSpaceAccessConfig(s.spaceId, s.spaceName, { adminUserIds: merged, inviterUserIds: cur.inviterUserIds }, true);
        results.push({ spaceId: s.spaceId, admins: merged.length });
      }
      return NextResponse.json({ seeded: results.length, results });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 422 });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
