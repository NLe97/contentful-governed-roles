import type { Identity } from "./identity";
import type { SpaceAccessConfig } from "@/lib/governance/store";

export function canAccessSpace(identity: Identity, cfg: SpaceAccessConfig, isBuiltinSpaceAdmin: boolean): boolean {
  if (identity.isOrgAdmin) return true;
  if (isBuiltinSpaceAdmin) return true;
  return cfg.adminUserIds.includes(identity.userId);
}

export function canInvite(identity: Identity, cfg: SpaceAccessConfig, isBuiltinSpaceAdmin: boolean): boolean {
  if (canAccessSpace(identity, cfg, isBuiltinSpaceAdmin)) return true;
  return cfg.inviterUserIds.includes(identity.userId);
}

// A non-privileged space admin (not org admin, not built-in super admin) must not change their OWN governance.
export function blocksSelfGovernanceLift(privileged: boolean, callerUserId: string, targetUserId: string): boolean {
  return !privileged && callerUserId === targetUserId;
}

// ...nor edit/delete a role they themselves currently hold (would let them weaken their own denies).
export function blocksOwnRoleEdit(privileged: boolean, callerRoleIds: string[], roleId: string): boolean {
  return !privileged && callerRoleIds.includes(roleId);
}
