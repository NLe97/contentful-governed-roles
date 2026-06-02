import { cma, withRetry } from "./client";
import { assertRemovable, type MembershipTarget, type ProtectedContext } from "@/lib/guardrails/protected";

export interface MemberRow { membershipId: string; userId: string; admin: boolean; roleIds: string[]; }

export async function listMembers(spaceId: string): Promise<MemberRow[]> {
  const space = await withRetry(() => cma().getSpace(spaceId));
  const res = await withRetry(() => space.getSpaceMemberships());
  return res.items.map((m) => ({
    membershipId: m.sys.id,
    userId: (m.user?.sys.id as string) ?? "",
    admin: Boolean(m.admin),
    roleIds: (m.roles ?? []).map((r) => r.sys.id),
  }));
}

export async function addMember(spaceId: string, email: string, roleId: string): Promise<string> {
  const space = await withRetry(() => cma().getSpace(spaceId));
  const created = await withRetry(() => space.createSpaceMembership({
    admin: false,
    email,
    roles: [{ sys: { type: "Link", linkType: "Role", id: roleId } }],
  } as never));
  return created.sys.id;
}

export async function removeMemberGuarded(
  target: MembershipTarget,
  ctx: ProtectedContext,
  remover: (t: MembershipTarget) => Promise<void>,
): Promise<void> {
  assertRemovable(target, ctx);
  await remover(target);
}

export async function deleteMembership(spaceId: string, membershipId: string): Promise<void> {
  const space = await withRetry(() => cma().getSpace(spaceId));
  const m = await withRetry(() => space.getSpaceMembership(membershipId));
  await withRetry(() => m.delete());
}
