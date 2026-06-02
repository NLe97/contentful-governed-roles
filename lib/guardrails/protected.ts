export interface ProtectedContext {
  protectedTeamId: string;
  orgAdminOwnerUserIds: string[];
}
export interface MembershipTarget {
  kind: "user" | "team";
  id: string;
}

export function isProtectedRemoval(target: MembershipTarget, ctx: ProtectedContext): boolean {
  if (target.kind === "team") return target.id === ctx.protectedTeamId;
  return ctx.orgAdminOwnerUserIds.includes(target.id);
}

export function assertRemovable(target: MembershipTarget, ctx: ProtectedContext): void {
  if (isProtectedRemoval(target, ctx)) {
    throw new Error(`Refused: ${target.kind} ${target.id} is a protected identity`);
  }
}
