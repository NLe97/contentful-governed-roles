import type { Identity } from "./identity";

export interface SpaceGovernanceGate {
  spaceId: string;
  inviterUserIds: string[];
}

export function canManageMembers(identity: Identity, gov: SpaceGovernanceGate): boolean {
  if (identity.isOrgAdmin) return true;
  return gov.inviterUserIds.includes(identity.userId);
}

export function requireOrgAdmin(identity: Identity): void {
  if (!identity.isOrgAdmin) {
    throw new Error("Forbidden: caller is not an org admin");
  }
}
