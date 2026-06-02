// Dev-only demo operations exercising BOTH MVPs against a live org via the service token.
// MVP 1 = Org Admins team auto-attach across spaces (+ protection story).
// MVP 2 = governed custom role with deny rules + delegated user management + protected identities.
//
// Not wired into the product auth path — gated behind ENABLE_DEMO and intended for local
// demos only. See app/api/demo/*.

import { cfGet, cfSend } from "@/lib/cma/rest";
import { computeGovernedRole } from "@/lib/policy/compute-governed-role";
import type { DenyPolicy } from "@/lib/policy/types";

export const GOVERNED_ROLE_NAME = "Space Admin (Governed)";

const ORG = () => process.env.CF_ORG_ID!;
const TEAM = () => process.env.CF_PROTECTED_TEAM_ID!;

// ---------- shared ----------

interface Membership { admin: boolean; roles?: { sys: { id: string } }[]; sys: { id: string; version: number; user: { sys: { id: string } } } }
interface OrgMembership { role: string; sys: { user: { sys: { id: string } } } }

/** Org admins/owners — the identities that must never be removed from a space. Derived server-side. */
export async function getProtectedUserIds(): Promise<string[]> {
  const res = await cfGet<{ items: OrgMembership[] }>(`/organizations/${ORG()}/organization_memberships?limit=1000`);
  return res.items.filter((m) => m.role === "admin" || m.role === "owner").map((m) => m.sys.user.sys.id);
}

// ---------- MVP 1: team auto-attach ----------

export interface SpaceTeamStatus { spaceId: string; spaceName: string; teamAttached: boolean; teamIsAdmin: boolean }

export async function listSpacesWithTeamStatus(): Promise<SpaceTeamStatus[]> {
  const spaces = await cfGet<{ items: { name: string; sys: { id: string } }[] }>(`/organizations/${ORG()}/spaces?limit=100`);
  const out: SpaceTeamStatus[] = [];
  for (const s of spaces.items) {
    const tsm = await cfGet<{ items: { admin: boolean; sys: { team: { sys: { id: string } } } }[] }>(
      `/spaces/${s.sys.id}/team_space_memberships`,
    );
    const match = tsm.items.find((m) => m.sys.team.sys.id === TEAM());
    out.push({ spaceId: s.sys.id, spaceName: s.name, teamAttached: Boolean(match), teamIsAdmin: Boolean(match?.admin) });
  }
  return out;
}

/** Ensure the protected team is attached as Admin on a space (idempotent). Returns the action taken. */
export async function ensureTeamAttached(spaceId: string): Promise<"already" | "attached"> {
  const tsm = await cfGet<{ items: { admin: boolean; sys: { id: string; version: number; team: { sys: { id: string } } } }[] }>(
    `/spaces/${spaceId}/team_space_memberships`,
  );
  const existing = tsm.items.find((m) => m.sys.team.sys.id === TEAM());
  if (existing?.admin) return "already";
  await cfSend("POST", `/spaces/${spaceId}/team_space_memberships`, { admin: true, roles: [] }, { "X-Contentful-Team": TEAM() });
  return "attached";
}

export async function attachTeamToAllSpaces(): Promise<{ spaceId: string; result: string }[]> {
  const statuses = await listSpacesWithTeamStatus();
  const results: { spaceId: string; result: string }[] = [];
  for (const s of statuses) {
    try {
      results.push({ spaceId: s.spaceId, result: await ensureTeamAttached(s.spaceId) });
    } catch (e) {
      results.push({ spaceId: s.spaceId, result: `error: ${(e as Error).message}` });
    }
  }
  return results;
}

// ---------- MVP 2: governed role + members ----------

export interface ContentTypeLite { id: string; name: string }
export async function listContentTypes(spaceId: string, env = "master"): Promise<ContentTypeLite[]> {
  const res = await cfGet<{ items: { name: string; sys: { id: string } }[] }>(
    `/spaces/${spaceId}/environments/${env}/content_types?limit=200`,
  );
  return res.items.map((c) => ({ id: c.sys.id, name: c.name }));
}

export interface RoleLite { id: string; name: string }
export async function listRoles(spaceId: string): Promise<RoleLite[]> {
  const res = await cfGet<{ items: { name: string; sys: { id: string } }[] }>(`/spaces/${spaceId}/roles?limit=100`);
  return res.items.map((r) => ({ id: r.sys.id, name: r.name }));
}

export interface GovernedStatus { roleExists: boolean; roleId: string | null; denies: DenyPolicy["denies"]; migratedCount: number }

async function findGovernedRole(spaceId: string): Promise<{ id: string } | null> {
  const roles = await cfGet<{ items: { name: string; sys: { id: string } }[] }>(`/spaces/${spaceId}/roles?limit=100`);
  const r = roles.items.find((x) => x.name === GOVERNED_ROLE_NAME);
  return r ? { id: r.sys.id } : null;
}

export async function getGovernedStatus(spaceId: string): Promise<GovernedStatus> {
  const role = await findGovernedRole(spaceId);
  if (!role) return { roleExists: false, roleId: null, denies: [], migratedCount: 0 };
  const full = await cfGet<{ policies: { effect: string; actions: string[]; constraint?: unknown }[] }>(`/spaces/${spaceId}/roles/${role.id}`);
  const denies = full.policies
    .filter((p) => p.effect === "deny")
    .map((p) => ({ action: (p.actions?.[0] === "update" ? "edit" : (p.actions?.[0] ?? "edit")) as DenyPolicy["denies"][number]["action"], contentTypeId: extractContentTypeId(p.constraint) }));
  const members = await cfGet<{ items: Membership[] }>(`/spaces/${spaceId}/space_memberships?limit=200`);
  const migratedCount = members.items.filter((m) => (m.roles ?? []).some((r) => r.sys.id === role.id)).length;
  return { roleExists: true, roleId: role.id, denies, migratedCount };
}

function extractContentTypeId(constraint: any): string {
  try { return constraint.and[0].equals[1]; } catch { return "(unknown)"; }
}

/** Toggle governed role ON: create/update the role with a deny rule, migrate non-protected space admins onto it. */
export async function applyGovernedRole(spaceId: string, contentTypeId: string, action: "edit" | "publish" = "edit"): Promise<{ roleId: string; migrated: string[]; skippedProtected: string[] }> {
  const policy: DenyPolicy = { name: GOVERNED_ROLE_NAME, denies: [{ action, contentTypeId }] };
  const def = computeGovernedRole(policy);
  const existing = await findGovernedRole(spaceId);
  let roleId: string;
  if (existing) {
    const current = await cfGet<{ sys: { version: number } }>(`/spaces/${spaceId}/roles/${existing.id}`);
    const updated = await cfSend<{ sys: { id: string } }>("PUT", `/spaces/${spaceId}/roles/${existing.id}`,
      { name: def.name, description: def.description ?? "", permissions: def.permissions, policies: def.policies },
      { "X-Contentful-Version": String(current.sys.version) });
    roleId = updated.sys.id;
  } else {
    const created = await cfSend<{ sys: { id: string } }>("POST", `/spaces/${spaceId}/roles`,
      { name: def.name, description: def.description ?? "", permissions: def.permissions, policies: def.policies });
    roleId = created.sys.id;
  }

  const protectedIds = await getProtectedUserIds();
  const members = await cfGet<{ items: Membership[] }>(`/spaces/${spaceId}/space_memberships?limit=200`);
  const migrated: string[] = [];
  const skippedProtected: string[] = [];
  for (const m of members.items) {
    if (!m.admin) continue; // only migrate built-in admins
    const userId = m.sys.user.sys.id;
    if (protectedIds.includes(userId)) { skippedProtected.push(userId); continue; }
    await cfSend("PUT", `/spaces/${spaceId}/space_memberships/${m.sys.id}`,
      { admin: false, roles: [{ sys: { type: "Link", linkType: "Role", id: roleId } }] },
      { "X-Contentful-Version": String(m.sys.version) });
    migrated.push(userId);
  }
  return { roleId, migrated, skippedProtected };
}

/** Toggle governed role OFF: restore governed-role members to built-in Admin, then delete the role. */
export async function removeGovernedRole(spaceId: string): Promise<{ restored: string[] }> {
  const role = await findGovernedRole(spaceId);
  if (!role) return { restored: [] };
  const members = await cfGet<{ items: Membership[] }>(`/spaces/${spaceId}/space_memberships?limit=200`);
  const restored: string[] = [];
  for (const m of members.items) {
    if (!(m.roles ?? []).some((r) => r.sys.id === role.id)) continue;
    await cfSend("PUT", `/spaces/${spaceId}/space_memberships/${m.sys.id}`,
      { admin: true, roles: [] },
      { "X-Contentful-Version": String(m.sys.version) });
    restored.push(m.sys.user.sys.id);
  }
  const fresh = await cfGet<{ sys: { version: number } }>(`/spaces/${spaceId}/roles/${role.id}`);
  await cfSend("DELETE", `/spaces/${spaceId}/roles/${role.id}`, undefined, { "X-Contentful-Version": String(fresh.sys.version) });
  return { restored };
}

export interface MemberView { membershipId: string; userId: string; admin: boolean; roleIds: string[]; protected: boolean }
export async function listMembersWithProtection(spaceId: string): Promise<MemberView[]> {
  const [members, protectedIds] = await Promise.all([
    cfGet<{ items: Membership[] }>(`/spaces/${spaceId}/space_memberships?limit=200`),
    getProtectedUserIds(),
  ]);
  return members.items.map((m) => ({
    membershipId: m.sys.id,
    userId: m.sys.user.sys.id,
    admin: m.admin,
    roleIds: (m.roles ?? []).map((r) => r.sys.id),
    protected: protectedIds.includes(m.sys.user.sys.id),
  }));
}

/** Delegated add-user: invite by email under a non-admin role (the bridge custom roles can't do). */
export async function addUser(spaceId: string, email: string, roleId: string): Promise<{ membershipId: string }> {
  const created = await cfSend<{ sys: { id: string } }>("POST", `/spaces/${spaceId}/space_memberships`, {
    admin: false,
    email,
    roles: [{ sys: { type: "Link", linkType: "Role", id: roleId } }],
  });
  return { membershipId: created.sys.id };
}

/** Guardrail: refuse to remove a protected identity; otherwise delete the membership. */
export async function removeUser(spaceId: string, membershipId: string): Promise<{ removed: boolean }> {
  const m = await cfGet<Membership>(`/spaces/${spaceId}/space_memberships/${membershipId}`);
  const protectedIds = await getProtectedUserIds();
  if (protectedIds.includes(m.sys.user.sys.id)) {
    throw new Error("Refused: this user is a protected org admin/owner and cannot be removed");
  }
  await cfSend("DELETE", `/spaces/${spaceId}/space_memberships/${membershipId}`, undefined, { "X-Contentful-Version": String(m.sys.version) });
  return { removed: true };
}
