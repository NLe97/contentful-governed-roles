export interface ReconcileInput {
  spaceId: string;
  governedRoleExists: boolean;
  protectedTeamPresent: boolean;
  protectedTeamId: string;
}
export interface ReconcilePlan {
  spaceId: string;
  reassertRole: boolean;
  reattachTeamId: string | null;
}
export function planReconcile(input: ReconcileInput): ReconcilePlan {
  return {
    spaceId: input.spaceId,
    reassertRole: !input.governedRoleExists,
    reattachTeamId: input.protectedTeamPresent ? null : input.protectedTeamId,
  };
}
