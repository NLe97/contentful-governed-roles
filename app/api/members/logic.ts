import { canManageMembers } from "@/lib/auth/authorize";
import type { Identity } from "@/lib/auth/identity";
import { assertRemovable, type ProtectedContext } from "@/lib/guardrails/protected";
import { buildAuditEvent, type AuditEvent } from "@/lib/audit/events";
import type { SpaceGovernanceRow } from "@/lib/governance/store";

interface Deps {
  addMember: (spaceId: string, email: string, roleId: string) => Promise<string>;
  removeMembership: (spaceId: string, membershipId: string) => Promise<void>;
  listMembers: (spaceId: string) => Promise<unknown[]>;
  appendAudit: (e: AuditEvent) => Promise<void>;
}
interface Input {
  identity: Identity; gov: SpaceGovernanceRow; ctx: ProtectedContext; deps: Deps;
  action: "add" | "remove"; email?: string; targetUserId?: string; membershipId?: string;
}

export async function handleMemberAction(input: Input): Promise<{ status: number; body: unknown }> {
  const { identity, gov, ctx, deps } = input;
  if (!canManageMembers(identity, gov)) return { status: 403, body: { error: "not authorized for this space" } };

  if (input.action === "add") {
    if (!input.email || !gov.governedRoleId) return { status: 422, body: { error: "email and governed role required" } };
    const membershipId = await deps.addMember(gov.spaceId, input.email, gov.governedRoleId);
    await deps.appendAudit(buildAuditEvent("MEMBER_ADDED", { spaceId: gov.spaceId, actorUserId: identity.userId, details: { email: input.email, membershipId } }));
    return { status: 200, body: { ok: true, membershipId } };
  }

  if (!input.targetUserId || !input.membershipId) return { status: 422, body: { error: "targetUserId and membershipId required" } };
  try {
    assertRemovable({ kind: "user", id: input.targetUserId }, ctx);
  } catch (e) {
    return { status: 403, body: { error: (e as Error).message } };
  }
  await deps.removeMembership(gov.spaceId, input.membershipId);
  await deps.appendAudit(buildAuditEvent("MEMBER_REMOVED", { spaceId: gov.spaceId, actorUserId: identity.userId, details: { targetUserId: input.targetUserId } }));
  return { status: 200, body: { ok: true } };
}
