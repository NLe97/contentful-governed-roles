import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { appendAudit } from "@/lib/governance/store";
import { isProtectedRemoval } from "@/lib/guardrails/protected";
import { buildAuditEvent } from "@/lib/audit/events";
import { getProtectedUserIds } from "@/lib/governance/protected-set";

function verify(raw: string, sig: string | null): boolean {
  if (!sig) return false;
  const expected = createHmac("sha256", process.env.CF_WEBHOOK_SECRET!).update(raw).digest("hex");
  try { return timingSafeEqual(Buffer.from(expected), Buffer.from(sig)); } catch { return false; }
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verify(raw, req.headers.get("x-contentful-webhook-signature"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  const topic = req.headers.get("x-contentful-topic") ?? "";
  const payload = JSON.parse(raw);
  const spaceId = payload?.sys?.space?.sys?.id;
  if (!topic.includes("Membership") || !topic.endsWith(".delete") || !spaceId) {
    return NextResponse.json({ ok: true, noop: true });
  }
  const ctx = { protectedTeamId: process.env.CF_PROTECTED_TEAM_ID!, orgAdminOwnerUserIds: await getProtectedUserIds(process.env.CF_ORG_ID!) };
  const target = topic.includes("TeamSpace")
    ? { kind: "team" as const, id: payload?.team?.sys?.id ?? "" }
    : { kind: "user" as const, id: payload?.user?.sys?.id ?? "" };
  if (isProtectedRemoval(target, ctx)) {
    await appendAudit(buildAuditEvent("PROTECTED_REMOVAL_DETECTED", { spaceId, details: { target } }));
  }
  return NextResponse.json({ ok: true });
}
