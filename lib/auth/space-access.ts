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
