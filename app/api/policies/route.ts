import { NextRequest, NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth/authorize";
import { resolveIdentity } from "@/lib/contentful/oauth";
import { DenyPolicySchema } from "@/lib/policy/types";
import { appendAudit } from "@/lib/governance/store";
import { buildAuditEvent } from "@/lib/audit/events";

export async function POST(req: NextRequest) {
  const token = req.cookies.get("cf_user_token")?.value;
  if (!token) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  let identity: Awaited<ReturnType<typeof resolveIdentity>>;
  try {
    identity = await resolveIdentity(token, process.env.CF_ORG_ID!);
  } catch {
    return NextResponse.json({ error: "invalid session" }, { status: 401 });
  }
  try { requireOrgAdmin(identity); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }
  const parsed = DenyPolicySchema.safeParse((await req.json()).policy);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  await appendAudit(buildAuditEvent("POLICY_DEFINED", { actorUserId: identity.userId, details: { policy: parsed.data } }));
  return NextResponse.json({ ok: true, policy: parsed.data });
}
