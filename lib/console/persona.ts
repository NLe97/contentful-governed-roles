import type { Identity } from "@/lib/auth/identity";

export type Persona = "orgAdmin" | "spaceAdmin" | "inviter" | "none";
export interface SpaceAccessInfo { spaceId: string; isAdmin: boolean; isInviter: boolean }
export interface PersonaResult { persona: Persona; adminSpaceIds: string[]; inviterSpaceIds: string[] }

export function resolvePersona(identity: Identity, spaces: SpaceAccessInfo[]): PersonaResult {
  if (identity.isOrgAdmin) {
    const all = spaces.map((s) => s.spaceId);
    return { persona: "orgAdmin", adminSpaceIds: all, inviterSpaceIds: all };
  }
  const adminSpaceIds = spaces.filter((s) => s.isAdmin).map((s) => s.spaceId);
  const inviterSpaceIds = spaces.filter((s) => s.isInviter).map((s) => s.spaceId);
  if (adminSpaceIds.length) return { persona: "spaceAdmin", adminSpaceIds, inviterSpaceIds };
  if (inviterSpaceIds.length) return { persona: "inviter", adminSpaceIds, inviterSpaceIds };
  return { persona: "none", adminSpaceIds: [], inviterSpaceIds: [] };
}
