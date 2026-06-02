import type { RoleDefinition } from "@/lib/policy/types";
import { cma, withRetry } from "./client";

export function roleNeedsUpdate(
  desired: Pick<RoleDefinition, "permissions" | "policies">,
  existing: Pick<RoleDefinition, "permissions" | "policies">,
): boolean {
  return JSON.stringify(desired.permissions) !== JSON.stringify(existing.permissions)
    || JSON.stringify(desired.policies) !== JSON.stringify(existing.policies);
}

export async function ensureGovernedRole(spaceId: string, def: RoleDefinition): Promise<string> {
  const space = await withRetry(() => cma().getSpace(spaceId));
  const roles = await withRetry(() => space.getRoles());
  const existing = roles.items.find((r) => r.name === def.name);
  if (!existing) {
    const created = await withRetry(() => space.createRole({
      name: def.name, description: def.description ?? "", permissions: def.permissions as never, policies: def.policies as never,
    }));
    return created.sys.id;
  }
  if (roleNeedsUpdate(def, { permissions: existing.permissions as never, policies: existing.policies as never })) {
    existing.permissions = def.permissions as never;
    existing.policies = def.policies as never;
    const updated = await withRetry(() => existing.update());
    return updated.sys.id;
  }
  return existing.sys.id;
}

export async function assignRole(spaceId: string, membershipId: string, roleId: string): Promise<void> {
  const space = await withRetry(() => cma().getSpace(spaceId));
  const m = await withRetry(() => space.getSpaceMembership(membershipId));
  m.admin = false;
  m.roles = [{ sys: { type: "Link", linkType: "Role", id: roleId } }] as never;
  await withRetry(() => m.update());
}
