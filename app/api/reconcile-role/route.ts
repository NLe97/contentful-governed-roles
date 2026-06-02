import { NextRequest, NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth/authorize";
import { resolveIdentity } from "@/lib/contentful/oauth";
import { appendAudit } from "@/lib/governance/store";
import { computeGovernedRole } from "@/lib/policy/compute-governed-role";
import { ensureGovernedRole } from "@/lib/cma/roles";
import { buildAuditEvent } from "@/lib/audit/events";
import { DenyPolicySchema } from "@/lib/policy/types";

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
  const { spaceId, policy } = await req.json();
  const parsed = DenyPolicySchema.safeParse(policy);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  const def = computeGovernedRole(parsed.data);
  const roleId = await ensureGovernedRole(spaceId, def);
  await appendAudit(buildAuditEvent("ROLE_UPDATED", { spaceId, actorUserId: identity.userId, details: { roleId } }));
  return NextResponse.json({ ok: true, roleId });
}
