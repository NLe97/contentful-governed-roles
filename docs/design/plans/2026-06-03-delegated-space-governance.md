# Delegated Per-Space Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Org Admins govern all spaces and let each space's Space Admins govern *their own* space — managing per-user deny-ruled custom roles + memberships through the app — with a separate add-user-only Inviter role.

**Architecture:** Extend the existing MVP 2 console. Authorization gains two per-space gates (`authorizeSpaceAccess`, `authorizeInviter`) keyed off *space* membership + stored admin/inviter lists, alongside the existing org-admin gate. The single governed role generalizes into per-space custom-role CRUD + member→role assignment over the space's real Contentful roles. A persona resolver drives a persona-aware console.

**Tech Stack:** Next.js (App Router), TypeScript, Node 20, npm, `contentful-management` (REST via `lib/cma/rest.ts`), Vitest. Run Node 20 via `. "$HOME/.nvm/nvm.sh" && nvm use 20`.

**Spec:** `docs/design/specs/2026-06-03-delegated-space-governance-design.md`

---

## File Structure

```
lib/auth/space-access.ts        # NEW pure: canAccessSpace, canInvite
lib/auth/require-request.ts     # MODIFY: + authorizeSpaceAccess, authorizeInviter
lib/console/persona.ts          # NEW pure: resolvePersona
lib/console/role-policy.ts      # NEW pure: decodeDenies, roleDeletable
lib/console/operations.ts       # MODIFY: role CRUD, assignMemberRole, builtin-admins, seedSpaceAdmins
lib/governance/store.ts         # MODIFY: adminUserIds / inviterUserIds / lastSeededAt read+write
app/api/console/me/route.ts     # NEW: persona + accessible spaces
app/api/console/roles/route.ts  # NEW: list/create/update/delete role, assign member (space-access gated)
app/api/console/admins/route.ts # NEW: manage admin/inviter lists + seed (org-admin gated)
app/api/console/mvp2/route.ts   # MODIFY: add-user -> authorizeInviter; per-space ops -> authorizeSpaceAccess
app/console/page.tsx            # MODIFY: persona-aware rendering
tests/...                       # mirrors lib/
```

---

## Task 1: Governance store — admin/inviter lists

**Files:**
- Modify: `lib/governance/store.ts`
- Test: `tests/governance/space-access-store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/governance/space-access-store.test.ts
import { describe, it, expect } from "vitest";
import { parseAccessConfig } from "@/lib/governance/store";

describe("parseAccessConfig", () => {
  it("reads admin/inviter lists from a spaceGovernance entry", () => {
    const entry = { fields: { spaceId: { "en-US": "s1" },
      adminUserIds: { "en-US": ["u-admin"] }, inviterUserIds: { "en-US": ["u-inv"] } } };
    const cfg = parseAccessConfig(entry as never);
    expect(cfg.adminUserIds).toEqual(["u-admin"]);
    expect(cfg.inviterUserIds).toEqual(["u-inv"]);
  });
  it("defaults to empty arrays when fields are missing", () => {
    const cfg = parseAccessConfig({ fields: { spaceId: { "en-US": "s1" } } } as never);
    expect(cfg.adminUserIds).toEqual([]);
    expect(cfg.inviterUserIds).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `. "$HOME/.nvm/nvm.sh" && nvm use 20 >/dev/null && npx vitest run tests/governance/space-access-store.test.ts`
Expected: FAIL — `parseAccessConfig` not exported.

- [ ] **Step 3: Add the implementation to `lib/governance/store.ts`**

Add near the top (after the `LOCALE`/`f` helpers already in the file):

```ts
export interface SpaceAccessConfig { adminUserIds: string[]; inviterUserIds: string[]; }

interface RawEntryLike { fields: Record<string, Record<string, unknown>> }
export function parseAccessConfig(entry: RawEntryLike): SpaceAccessConfig {
  const a = (entry.fields.adminUserIds as Record<string, string[]> | undefined)?.[LOCALE] ?? [];
  const i = (entry.fields.inviterUserIds as Record<string, string[]> | undefined)?.[LOCALE] ?? [];
  return { adminUserIds: a as string[], inviterUserIds: i as string[] };
}

// Read the access config for a space (empty config if no governance entry yet).
export async function getSpaceAccessConfig(spaceId: string): Promise<SpaceAccessConfig> {
  const env = await govEnv();
  const res = await withRetry(() => env.getEntries({ content_type: "spaceGovernance", "fields.spaceId": spaceId }));
  const item = (res.items as unknown as RawEntryLike[])[0];
  return item ? parseAccessConfig(item) : { adminUserIds: [], inviterUserIds: [] };
}

// Upsert admin/inviter lists for a space (merge-safe: pass the full desired arrays).
export async function setSpaceAccessConfig(spaceId: string, spaceName: string, cfg: Partial<SpaceAccessConfig>): Promise<void> {
  const env = await govEnv();
  const res = await withRetry(() => env.getEntries({ content_type: "spaceGovernance", "fields.spaceId": spaceId }));
  const existing = res.items[0] as any;
  const fields = {
    spaceId: { [LOCALE]: spaceId },
    spaceName: { [LOCALE]: spaceName },
    adminUserIds: { [LOCALE]: cfg.adminUserIds ?? parseAccessConfig(existing ?? { fields: {} }).adminUserIds },
    inviterUserIds: { [LOCALE]: cfg.inviterUserIds ?? parseAccessConfig(existing ?? { fields: {} }).inviterUserIds },
    lastSeededAt: { [LOCALE]: new Date().toISOString() },
  };
  if (existing) { existing.fields = { ...existing.fields, ...fields }; await withRetry(() => existing.update()); }
  else { await withRetry(() => env.createEntry("spaceGovernance", { fields })); }
}
```

> Note: `govEnv`, `withRetry`, `LOCALE` already exist in this file. If `govEnv` is not exported/visible, reuse the existing private helper already used by `getSpaceGovernance`/`appendAudit`.
>
> **Content-model prerequisite (do this first or writes 422):** the `spaceGovernance` content type must have `adminUserIds` (Object), `inviterUserIds` (Object), and `lastSeededAt` (Date) fields. `scripts/bootstrap.ts` already defines `inviterUserIds`; add `adminUserIds` (Object) and `lastSeededAt` (Date) to its `spaceGovernance` field list, then re-run `npx tsx scripts/bootstrap.ts`. (bootstrap is idempotent; but a content type that already exists is skipped — so to add fields to an existing type, either add the fields via the Contentful UI or extend bootstrap to update existing types.)

- [ ] **Step 4: Run test to verify it passes**

Run: `. "$HOME/.nvm/nvm.sh" && nvm use 20 >/dev/null && npx vitest run tests/governance/space-access-store.test.ts && npm run typecheck`
Expected: PASS (2 tests); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add lib/governance/store.ts tests/governance/space-access-store.test.ts
git commit -m "feat(store): per-space admin/inviter access config"
```

---

## Task 2: Space-access decision (pure)

**Files:**
- Create: `lib/auth/space-access.ts`
- Test: `tests/auth/space-access.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/auth/space-access.test.ts
import { describe, it, expect } from "vitest";
import { canAccessSpace, canInvite } from "@/lib/auth/space-access";

const cfg = { adminUserIds: ["u-admin"], inviterUserIds: ["u-inv"] };
const org = { userId: "u-o", isOrgAdmin: true };
const admin = { userId: "u-admin", isOrgAdmin: false };
const inviter = { userId: "u-inv", isOrgAdmin: false };
const stranger = { userId: "u-x", isOrgAdmin: false };

describe("canAccessSpace", () => {
  it("allows org admins", () => expect(canAccessSpace(org, cfg, false)).toBe(true));
  it("allows a built-in space admin even if not in the list", () => expect(canAccessSpace(stranger, cfg, true)).toBe(true));
  it("allows a listed space admin", () => expect(canAccessSpace(admin, cfg, false)).toBe(true));
  it("denies a stranger who is not a built-in admin", () => expect(canAccessSpace(stranger, cfg, false)).toBe(false));
  it("denies an inviter from full space access", () => expect(canAccessSpace(inviter, cfg, false)).toBe(false));
});

describe("canInvite", () => {
  it("allows an inviter", () => expect(canInvite(inviter, cfg, false)).toBe(true));
  it("allows anyone with space access", () => expect(canInvite(admin, cfg, false)).toBe(true));
  it("denies a stranger", () => expect(canInvite(stranger, cfg, false)).toBe(false));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `. "$HOME/.nvm/nvm.sh" && nvm use 20 >/dev/null && npx vitest run tests/auth/space-access.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// lib/auth/space-access.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `. "$HOME/.nvm/nvm.sh" && nvm use 20 >/dev/null && npx vitest run tests/auth/space-access.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/auth/space-access.ts tests/auth/space-access.test.ts
git commit -m "feat(auth): per-space access + invite decision helpers"
```

---

## Task 3: Persona resolver (pure)

**Files:**
- Create: `lib/console/persona.ts`
- Test: `tests/console/persona.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/console/persona.test.ts
import { describe, it, expect } from "vitest";
import { resolvePersona } from "@/lib/console/persona";

const spaces = [
  { spaceId: "s1", isAdmin: true, isInviter: true },
  { spaceId: "s2", isAdmin: false, isInviter: true },
  { spaceId: "s3", isAdmin: false, isInviter: false },
];

describe("resolvePersona", () => {
  it("org admin gets all spaces", () => {
    const r = resolvePersona({ userId: "u", isOrgAdmin: true }, spaces);
    expect(r.persona).toBe("orgAdmin");
    expect(r.adminSpaceIds).toEqual(["s1", "s2", "s3"]);
  });
  it("space admin gets only their admin spaces", () => {
    const r = resolvePersona({ userId: "u", isOrgAdmin: false }, spaces);
    expect(r.persona).toBe("spaceAdmin");
    expect(r.adminSpaceIds).toEqual(["s1"]);
    expect(r.inviterSpaceIds).toEqual(["s1", "s2"]);
  });
  it("inviter-only when no admin spaces", () => {
    const r = resolvePersona({ userId: "u", isOrgAdmin: false }, [{ spaceId: "s2", isAdmin: false, isInviter: true }]);
    expect(r.persona).toBe("inviter");
  });
  it("none when no access", () => {
    const r = resolvePersona({ userId: "u", isOrgAdmin: false }, [{ spaceId: "s3", isAdmin: false, isInviter: false }]);
    expect(r.persona).toBe("none");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `. "$HOME/.nvm/nvm.sh" && nvm use 20 >/dev/null && npx vitest run tests/console/persona.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// lib/console/persona.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `. "$HOME/.nvm/nvm.sh" && nvm use 20 >/dev/null && npx vitest run tests/console/persona.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/console/persona.ts tests/console/persona.test.ts
git commit -m "feat(console): persona resolver"
```

---

## Task 4: Role-policy decode + delete-safety (pure)

**Files:**
- Create: `lib/console/role-policy.ts`
- Test: `tests/console/role-policy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/console/role-policy.test.ts
import { describe, it, expect } from "vitest";
import { decodeDenies, roleDeletable } from "@/lib/console/role-policy";

describe("decodeDenies", () => {
  it("maps deny policies back to deny rules (update->edit)", () => {
    const policies = [
      { effect: "allow", actions: "all" },
      { effect: "deny", actions: ["update"], constraint: { and: [{ equals: [{ doc: "sys.contentType.sys.id" }, "config"] }] } },
      { effect: "deny", actions: ["publish"], constraint: { and: [{ equals: [{ doc: "sys.contentType.sys.id" }, "post"] }] } },
    ];
    expect(decodeDenies(policies as never)).toEqual([
      { action: "edit", contentTypeId: "config" },
      { action: "publish", contentTypeId: "post" },
    ]);
  });
});

describe("roleDeletable", () => {
  it("is deletable when no member holds it", () => {
    expect(roleDeletable("r1", [{ roleIds: ["r2"] }])).toEqual({ deletable: true, holders: 0 });
  });
  it("is blocked when members still hold it", () => {
    expect(roleDeletable("r1", [{ roleIds: ["r1"] }, { roleIds: ["r1"] }])).toEqual({ deletable: false, holders: 2 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `. "$HOME/.nvm/nvm.sh" && nvm use 20 >/dev/null && npx vitest run tests/console/role-policy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// lib/console/role-policy.ts
import type { DenyPolicy } from "@/lib/policy/types";

type Action = DenyPolicy["denies"][number]["action"];
const REVERSE: Record<string, Action> = { update: "edit", publish: "publish", create: "create", delete: "delete" };

interface RolePolicyLike { effect: string; actions: string | string[]; constraint?: unknown }

export function decodeDenies(policies: RolePolicyLike[]): DenyPolicy["denies"] {
  return policies
    .filter((p) => p.effect === "deny")
    .map((p) => {
      const action = Array.isArray(p.actions) ? p.actions[0] : p.actions;
      return { action: REVERSE[action ?? ""] ?? "edit", contentTypeId: extractContentTypeId(p.constraint) };
    });
}

function extractContentTypeId(constraint: unknown): string {
  try { return (constraint as any).and[0].equals[1]; } catch { return "(unknown)"; }
}

export function roleDeletable(roleId: string, members: { roleIds: string[] }[]): { deletable: boolean; holders: number } {
  const holders = members.filter((m) => m.roleIds.includes(roleId)).length;
  return { deletable: holders === 0, holders };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `. "$HOME/.nvm/nvm.sh" && nvm use 20 >/dev/null && npx vitest run tests/console/role-policy.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/console/role-policy.ts tests/console/role-policy.test.ts
git commit -m "feat(console): role-policy decode + delete-safety helpers"
```

---

## Task 5: CMA role-CRUD + assignment + seeding operations

**Files:**
- Modify: `lib/console/operations.ts`
- Test: `tests/console/assign-guardrail.test.ts`

These wrap CMA REST; only the assignment guardrail is unit-tested (the rest is live-only and just needs to typecheck).

- [ ] **Step 1: Write the failing test** (pure guardrail wrapper)

```ts
// tests/console/assign-guardrail.test.ts
import { describe, it, expect, vi } from "vitest";
import { assignMemberRoleGuarded } from "@/lib/console/operations";

const ctx = { protectedTeamId: "t", orgAdminOwnerUserIds: ["u-owner"] };

describe("assignMemberRoleGuarded", () => {
  it("refuses to re-role a protected org admin/owner", async () => {
    const apply = vi.fn();
    await expect(assignMemberRoleGuarded("u-owner", ctx, apply)).rejects.toThrow(/protected/i);
    expect(apply).not.toHaveBeenCalled();
  });
  it("applies for an ordinary member", async () => {
    const apply = vi.fn().mockResolvedValue(undefined);
    await assignMemberRoleGuarded("u-x", ctx, apply);
    expect(apply).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `. "$HOME/.nvm/nvm.sh" && nvm use 20 >/dev/null && npx vitest run tests/console/assign-guardrail.test.ts`
Expected: FAIL — `assignMemberRoleGuarded` not exported.

- [ ] **Step 3: Add implementations to `lib/console/operations.ts`**

Append (uses existing `cfGet`, `cfSend`, `computeGovernedRole`, `getProtectedUserIds`, and `lib/guardrails/protected`):

```ts
import { isProtectedRemoval, type ProtectedContext } from "@/lib/guardrails/protected";
import { decodeDenies, roleDeletable } from "./role-policy";
import type { DenyPolicy } from "@/lib/policy/types";

export interface SpaceRole { id: string; name: string; denies: DenyPolicy["denies"] }

export async function listSpaceRoles(spaceId: string): Promise<SpaceRole[]> {
  const res = await cfGet<{ items: { name: string; policies: any[]; sys: { id: string } }[] }>(`/spaces/${spaceId}/roles?limit=100`);
  return res.items.map((r) => ({ id: r.sys.id, name: r.name, denies: decodeDenies(r.policies ?? []) }));
}

export async function createSpaceRole(spaceId: string, policy: DenyPolicy): Promise<string> {
  const def = computeGovernedRole(policy);
  const created = await cfSend<{ sys: { id: string } }>("POST", `/spaces/${spaceId}/roles`,
    { name: def.name, description: def.description ?? "", permissions: def.permissions, policies: def.policies });
  return created.sys.id;
}

export async function updateSpaceRole(spaceId: string, roleId: string, policy: DenyPolicy): Promise<void> {
  const def = computeGovernedRole(policy);
  const cur = await cfGet<{ sys: { version: number } }>(`/spaces/${spaceId}/roles/${roleId}`);
  await cfSend("PUT", `/spaces/${spaceId}/roles/${roleId}`,
    { name: def.name, description: def.description ?? "", permissions: def.permissions, policies: def.policies },
    { "X-Contentful-Version": String(cur.sys.version) });
}

// Block deletion if any member still holds the role (Q3: block + prompt).
export async function deleteSpaceRole(spaceId: string, roleId: string): Promise<void> {
  const members = await listMembersWithProtection(spaceId);
  const { deletable, holders } = roleDeletable(roleId, members.map((m) => ({ roleIds: m.roleIds })));
  if (!deletable) throw new Error(`Refused: ${holders} member(s) still hold this role — reassign them first`);
  const cur = await cfGet<{ sys: { version: number } }>(`/spaces/${spaceId}/roles/${roleId}`);
  await cfSend("DELETE", `/spaces/${spaceId}/roles/${roleId}`, undefined, { "X-Contentful-Version": String(cur.sys.version) });
}

// Guardrail wrapper: refuse to re-role a protected identity; otherwise run `apply`.
export async function assignMemberRoleGuarded(targetUserId: string, ctx: ProtectedContext, apply: () => Promise<void>): Promise<void> {
  if (isProtectedRemoval({ kind: "user", id: targetUserId }, ctx)) {
    throw new Error("Refused: target is a protected org admin/owner");
  }
  await apply();
}

// Assign a space member (by membership id) to a custom role (admin:false). Guardrailed by caller.
export async function assignMemberRole(spaceId: string, membershipId: string, roleId: string): Promise<void> {
  const m = await cfGet<{ sys: { version: number } }>(`/spaces/${spaceId}/space_memberships/${membershipId}`);
  await cfSend("PUT", `/spaces/${spaceId}/space_memberships/${membershipId}`,
    { admin: false, roles: [{ sys: { type: "Link", linkType: "Role", id: roleId } }] },
    { "X-Contentful-Version": String(m.sys.version) });
}

export async function listBuiltinAdmins(spaceId: string): Promise<string[]> {
  const res = await cfGet<{ items: { admin: boolean; sys: { user: { sys: { id: string } } } }[] }>(`/spaces/${spaceId}/space_memberships?limit=200`);
  return res.items.filter((m) => m.admin).map((m) => m.sys.user.sys.id);
}

export async function isBuiltinSpaceAdmin(spaceId: string, userId: string): Promise<boolean> {
  return (await listBuiltinAdmins(spaceId)).includes(userId);
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `. "$HOME/.nvm/nvm.sh" && nvm use 20 >/dev/null && npx vitest run tests/console/assign-guardrail.test.ts && npm run typecheck`
Expected: PASS (2 tests); typecheck clean. (Add localized `as never` casts if the SDK/REST types complain.)

- [ ] **Step 5: Commit**

```bash
git add lib/console/operations.ts tests/console/assign-guardrail.test.ts
git commit -m "feat(console): role CRUD, guarded member assignment, builtin-admin lookup"
```

---

## Task 6: Per-space authorization gates

**Files:**
- Modify: `lib/auth/require-request.ts`
- Test: (covered by Task 2 pure logic; this is wiring — verified by typecheck + Task 10 live check)

- [ ] **Step 1: Add the gates**

Append to `lib/auth/require-request.ts`:

```ts
import { canAccessSpace, canInvite } from "@/lib/auth/space-access";
import { getSpaceAccessConfig } from "@/lib/governance/store";
import { isBuiltinSpaceAdmin } from "@/lib/console/operations";

async function resolveCaller(req: NextRequest): Promise<Identity | NextResponse> {
  const token = req.cookies.get("cf_user_token")?.value;
  if (!token) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  try { return await resolveIdentity(token, process.env.CF_ORG_ID!); }
  catch { return NextResponse.json({ error: "invalid session" }, { status: 401 }); }
}

export async function authorizeSpaceAccess(req: NextRequest, spaceId: string): Promise<{ identity: Identity } | { error: NextResponse }> {
  const idOrErr = await resolveCaller(req);
  if (idOrErr instanceof NextResponse) return { error: idOrErr };
  const identity = idOrErr;
  if (identity.isOrgAdmin) return { identity };
  const [cfg, builtin] = await Promise.all([getSpaceAccessConfig(spaceId), isBuiltinSpaceAdmin(spaceId, identity.userId)]);
  if (canAccessSpace(identity, cfg, builtin)) return { identity };
  return { error: NextResponse.json({ error: "no access to this space" }, { status: 403 }) };
}

export async function authorizeInviter(req: NextRequest, spaceId: string): Promise<{ identity: Identity } | { error: NextResponse }> {
  const idOrErr = await resolveCaller(req);
  if (idOrErr instanceof NextResponse) return { error: idOrErr };
  const identity = idOrErr;
  if (identity.isOrgAdmin) return { identity };
  const [cfg, builtin] = await Promise.all([getSpaceAccessConfig(spaceId), isBuiltinSpaceAdmin(spaceId, identity.userId)]);
  if (canInvite(identity, cfg, builtin)) return { identity };
  return { error: NextResponse.json({ error: "cannot invite to this space" }, { status: 403 }) };
}
```

> If a circular import arises (operations.ts ↔ require-request.ts), move `isBuiltinSpaceAdmin` to import from a leaf module or inline the membership fetch here using `cfGet`. Keep `authorizeOrgAdmin` unchanged.

- [ ] **Step 2: Typecheck**

Run: `. "$HOME/.nvm/nvm.sh" && nvm use 20 >/dev/null && npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/auth/require-request.ts
git commit -m "feat(auth): authorizeSpaceAccess + authorizeInviter gates"
```

---

## Task 7: `/api/console/me` — persona + accessible spaces

**Files:**
- Create: `app/api/console/me/route.ts`

- [ ] **Step 1: Write the route**

```ts
// app/api/console/me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { resolveIdentity } from "@/lib/contentful/oauth";
import { resolvePersona, type SpaceAccessInfo } from "@/lib/console/persona";
import { getSpaceAccessConfig } from "@/lib/governance/store";
import { canAccessSpace, canInvite } from "@/lib/auth/space-access";
import { listSpacesWithTeamStatus, listBuiltinAdmins } from "@/lib/console/operations";
import { pmap } from "@/lib/cma/rest";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("cf_user_token")?.value;
  if (!token) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  let identity;
  try { identity = await resolveIdentity(token, process.env.CF_ORG_ID!); }
  catch { return NextResponse.json({ error: "invalid session" }, { status: 401 }); }

  const spaces = await listSpacesWithTeamStatus();
  const access: SpaceAccessInfo[] = await pmap(spaces, async (s) => {
    if (identity!.isOrgAdmin) return { spaceId: s.spaceId, isAdmin: true, isInviter: true };
    const [cfg, admins] = await Promise.all([getSpaceAccessConfig(s.spaceId), listBuiltinAdmins(s.spaceId)]);
    const builtin = admins.includes(identity!.userId);
    return { spaceId: s.spaceId, isAdmin: canAccessSpace(identity!, cfg, builtin), isInviter: canInvite(identity!, cfg, builtin) };
  }, 6);

  const persona = resolvePersona(identity, access);
  const named = spaces.map((s) => ({ spaceId: s.spaceId, spaceName: s.spaceName }));
  return NextResponse.json({ identity, ...persona, spaces: named });
}
```

- [ ] **Step 2: Typecheck + build**

Run: `. "$HOME/.nvm/nvm.sh" && nvm use 20 >/dev/null && npm run typecheck && npm run build 2>&1 | grep -E "Compiled|error" | head`
Expected: typecheck clean; build compiles `/api/console/me`.

- [ ] **Step 3: Commit**

```bash
git add app/api/console/me/route.ts
git commit -m "feat(api): /api/console/me persona resolution"
```

---

## Task 8: `/api/console/roles` — role CRUD + assignment (space-access gated)

**Files:**
- Create: `app/api/console/roles/route.ts`

- [ ] **Step 1: Write the route**

```ts
// app/api/console/roles/route.ts
import { NextRequest, NextResponse } from "next/server";
import { authorizeSpaceAccess } from "@/lib/auth/require-request";
import {
  listSpaceRoles, createSpaceRole, updateSpaceRole, deleteSpaceRole,
  assignMemberRole, assignMemberRoleGuarded, listMembersWithProtection, getProtectedUserIds,
} from "@/lib/console/operations";
import { DenyPolicySchema } from "@/lib/policy/types";

export async function GET(req: NextRequest) {
  const spaceId = req.nextUrl.searchParams.get("spaceId");
  if (!spaceId) return NextResponse.json({ error: "spaceId required" }, { status: 422 });
  const auth = await authorizeSpaceAccess(req, spaceId); if ("error" in auth) return auth.error;
  const [roles, members] = await Promise.all([listSpaceRoles(spaceId), listMembersWithProtection(spaceId)]);
  return NextResponse.json({ roles, members });
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  const spaceId = b.spaceId as string;
  if (!spaceId) return NextResponse.json({ error: "spaceId required" }, { status: 422 });
  const auth = await authorizeSpaceAccess(req, spaceId); if ("error" in auth) return auth.error;
  try {
    switch (b.action) {
      case "createRole": {
        const p = DenyPolicySchema.safeParse(b.policy); if (!p.success) return NextResponse.json({ error: p.error.message }, { status: 422 });
        return NextResponse.json({ roleId: await createSpaceRole(spaceId, p.data) });
      }
      case "updateRole": {
        const p = DenyPolicySchema.safeParse(b.policy); if (!p.success) return NextResponse.json({ error: p.error.message }, { status: 422 });
        await updateSpaceRole(spaceId, b.roleId, p.data); return NextResponse.json({ ok: true });
      }
      case "deleteRole":
        await deleteSpaceRole(spaceId, b.roleId); return NextResponse.json({ ok: true });
      case "assign": {
        const ctx = { protectedTeamId: process.env.CF_PROTECTED_TEAM_ID!, orgAdminOwnerUserIds: await getProtectedUserIds() };
        await assignMemberRoleGuarded(b.targetUserId, ctx, () => assignMemberRole(spaceId, b.membershipId, b.roleId));
        return NextResponse.json({ ok: true });
      }
      default: return NextResponse.json({ error: "unknown action" }, { status: 422 });
    }
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
```

- [ ] **Step 2: Typecheck + build**

Run: `. "$HOME/.nvm/nvm.sh" && nvm use 20 >/dev/null && npm run typecheck && npm run build 2>&1 | grep -E "Compiled|error" | head`
Expected: clean; compiles `/api/console/roles`.

- [ ] **Step 3: Commit**

```bash
git add app/api/console/roles/route.ts
git commit -m "feat(api): per-space role CRUD + guarded assignment"
```

---

## Task 9: `/api/console/admins` — manage lists + seed (org-admin only)

**Files:**
- Create: `app/api/console/admins/route.ts`

- [ ] **Step 1: Write the route**

```ts
// app/api/console/admins/route.ts
import { NextRequest, NextResponse } from "next/server";
import { authorizeOrgAdmin } from "@/lib/auth/require-request";
import { getSpaceAccessConfig, setSpaceAccessConfig } from "@/lib/governance/store";
import { listBuiltinAdmins, listSpacesWithTeamStatus } from "@/lib/console/operations";

export async function GET(req: NextRequest) {
  const auth = await authorizeOrgAdmin(req); if ("error" in auth) return auth.error;
  const spaceId = req.nextUrl.searchParams.get("spaceId");
  if (!spaceId) return NextResponse.json({ error: "spaceId required" }, { status: 422 });
  return NextResponse.json({ config: await getSpaceAccessConfig(spaceId), builtinAdmins: await listBuiltinAdmins(spaceId) });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeOrgAdmin(req); if ("error" in auth) return auth.error;
  const b = await req.json();
  try {
    if (b.action === "setLists") {
      await setSpaceAccessConfig(b.spaceId, b.spaceName ?? b.spaceId, { adminUserIds: b.adminUserIds, inviterUserIds: b.inviterUserIds });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "seedAll") {
      const spaces = await listSpacesWithTeamStatus();
      const results = [];
      for (const s of spaces) {
        const admins = await listBuiltinAdmins(s.spaceId);
        const cur = await getSpaceAccessConfig(s.spaceId);
        const merged = Array.from(new Set([...cur.adminUserIds, ...admins]));
        await setSpaceAccessConfig(s.spaceId, s.spaceName, { adminUserIds: merged, inviterUserIds: cur.inviterUserIds });
        results.push({ spaceId: s.spaceId, admins: merged.length });
      }
      return NextResponse.json({ seeded: results.length, results });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 422 });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
```

- [ ] **Step 2: Typecheck + build**

Run: `. "$HOME/.nvm/nvm.sh" && nvm use 20 >/dev/null && npm run typecheck && npm run build 2>&1 | grep -E "Compiled|error" | head`
Expected: clean; compiles `/api/console/admins`.

- [ ] **Step 3: Commit**

```bash
git add app/api/console/admins/route.ts
git commit -m "feat(api): admin/inviter list management + seed sweep (org-admin)"
```

---

## Task 10: Re-gate existing per-space MVP 2 endpoints

**Files:**
- Modify: `app/api/console/mvp2/route.ts`

- [ ] **Step 1: Change gates**

In `app/api/console/mvp2/route.ts`:
- Add import: `import { authorizeSpaceAccess, authorizeInviter } from "@/lib/auth/require-request";`
- For `GET` and for the POST actions `applyGoverned` / `removeGoverned` / `removeUser`: replace `authorizeOrgAdmin(req)` with `authorizeSpaceAccess(req, spaceId)` (read `spaceId` from the query for GET, from the body for POST before the switch).
- For the `addUser` action: gate with `authorizeInviter(req, b.spaceId)`.
- Keep `applyGovernedAll` / `removeGovernedAll` (bulk) on `authorizeOrgAdmin` (org-wide).

Concretely, restructure POST so `spaceId` is read first, then choose the gate per action:

```ts
export async function POST(req: NextRequest) {
  const b = await req.json();
  const bulk = b.action === "applyGovernedAll" || b.action === "removeGovernedAll";
  const auth = bulk ? await authorizeOrgAdmin(req)
    : b.action === "addUser" ? await authorizeInviter(req, b.spaceId)
    : await authorizeSpaceAccess(req, b.spaceId);
  if ("error" in auth) return auth.error;
  try {
    switch (b.action) {
      case "applyGoverned": return NextResponse.json(await applyGovernedRole(b.spaceId, b.contentTypeId, b.denyAction ?? "edit"));
      case "removeGoverned": return NextResponse.json(await removeGovernedRole(b.spaceId));
      case "addUser": return NextResponse.json(await addUser(b.spaceId, b.email, b.roleId));
      case "removeUser": return NextResponse.json(await removeUser(b.spaceId, b.membershipId));
      case "applyGovernedAll": return NextResponse.json(await applyGovernedToAllSpaces(b.contentTypeId || "post", b.denyAction ?? "edit"));
      case "removeGovernedAll": return NextResponse.json(await removeGovernedFromAllSpaces());
      default: return NextResponse.json({ error: "unknown action" }, { status: 422 });
    }
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
```

And `GET`: read `const spaceId = req.nextUrl.searchParams.get("spaceId")`, then `const auth = await authorizeSpaceAccess(req, spaceId!); if ("error" in auth) return auth.error;`.

- [ ] **Step 2: Verify + live-check the gate**

Run: `. "$HOME/.nvm/nvm.sh" && nvm use 20 >/dev/null && npm run typecheck && npm run build 2>&1 | grep -E "Compiled|error" | head`
Then with the dev server running, confirm an org-admin cookie still gets 200 and no cookie gets 401:
```bash
curl -s -o /dev/null -w "no cookie: %{http_code}\n" "http://localhost:3000/api/console/mvp2?spaceId=hgnalq3865je"
curl -s -o /dev/null -w "org cookie: %{http_code}\n" -H "Cookie: cf_user_token=$CF_SERVICE_TOKEN" "http://localhost:3000/api/console/mvp2?spaceId=hgnalq3865je"
```
Expected: `401` then `200`.

- [ ] **Step 3: Commit**

```bash
git add app/api/console/mvp2/route.ts
git commit -m "feat(api): re-gate per-space MVP2 ops by space access / invite"
```

---

## Task 11: Persona-aware console UI

**Files:**
- Modify: `app/console/page.tsx`

- [ ] **Step 1: Load persona first, branch the UI**

At the top of the component, fetch `/api/console/me` on mount; store `persona`, `adminSpaceIds`, `spaces`. Then:
- If `persona === "none"` → show "No governed spaces for your account. Ask an Org Admin to add you."
- If `persona === "orgAdmin"` → render the existing full console (MVP 1 + MVP 2 + bulk) **plus** a new "Admins & inviters" panel (Task 12) and a **"Seed Space Admins from built-in admins"** button calling `POST /api/console/admins {action:"seedAll"}`.
- If `persona === "spaceAdmin"` → hide MVP 1 + bulk; show only the **space picker limited to `adminSpaceIds`** and, per space, the **Roles manager** (list/create/edit/delete deny-ruled roles via `/api/console/roles`) + **Members** (assign role, add/remove user).
- If `persona === "inviter"` → show only an add-user form for the inviter's spaces.

Add a roles panel that uses `/api/console/roles`:

```tsx
// inside the component — minimal Roles manager for the selected space
async function loadRoles(id: string) {
  const d = await call(`/api/console/roles?spaceId=${id}`); setRoles(d.roles); setMembers(d.members);
}
async function createRole() {
  await call("/api/console/roles", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "createRole", spaceId, policy: { name: roleName, denies: [{ action: denyAction, contentTypeId: denyCt }] } }) });
  await loadRoles(spaceId);
}
async function assign(membershipId: string, targetUserId: string, roleId: string) {
  await call("/api/console/roles", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "assign", spaceId, membershipId, targetUserId, roleId }) });
  await loadRoles(spaceId);
}
async function deleteRole(roleId: string) {
  await call("/api/console/roles", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "deleteRole", spaceId, roleId }) }); // shows the block error if held
  await loadRoles(spaceId);
}
```

Render: a roles list (name + denies + Delete), a "create role" form (name, deny action, content type), and a members table where each member has a role dropdown (the space's custom roles) + an Assign button; protected members show 🛡️ and are not assignable. Keep the existing add-user form gated to inviter spaces.

- [ ] **Step 2: Build**

Run: `. "$HOME/.nvm/nvm.sh" && nvm use 20 >/dev/null && npm run build 2>&1 | grep -E "Compiled|error|Failed" | head`
Expected: compiles.

- [ ] **Step 3: Commit**

```bash
git add app/console/page.tsx
git commit -m "feat(ui): persona-aware console (org admin / space admin / inviter)"
```

---

## Task 12: Org-admin Admins & Inviters panel

**Files:**
- Modify: `app/console/page.tsx`

- [ ] **Step 1: Add the panel (org-admin only)**

For the selected space, fetch `GET /api/console/admins?spaceId=…` → show `builtinAdmins`, editable `adminUserIds`, `inviterUserIds` (comma-separated inputs), and a **Save** button calling `POST /api/console/admins {action:"setLists", spaceId, spaceName, adminUserIds, inviterUserIds}`. Add a top-level **"Seed Space Admins (all spaces)"** button calling `{action:"seedAll"}` and showing the result count.

```tsx
async function loadAdmins(id: string) { const d = await call(`/api/console/admins?spaceId=${id}`); setBuiltin(d.builtinAdmins); setAdminIds(d.config.adminUserIds.join(", ")); setInviterIds(d.config.inviterUserIds.join(", ")); }
async function saveLists() {
  await call("/api/console/admins", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "setLists", spaceId, adminUserIds: adminIds.split(",").map(s=>s.trim()).filter(Boolean), inviterUserIds: inviterIds.split(",").map(s=>s.trim()).filter(Boolean) }) });
}
async function seedAll() { const d = await call("/api/console/admins", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "seedAll" }) }); setSeedOut(`seeded ${d.seeded} spaces`); }
```

- [ ] **Step 2: Build + full test suite**

Run: `. "$HOME/.nvm/nvm.sh" && nvm use 20 >/dev/null && npm run build 2>&1 | grep -E "Compiled|error" | head && npx vitest run 2>&1 | grep -E "Test Files|Tests " && npm run typecheck 2>&1 | tail -1`
Expected: build compiles; all tests pass; typecheck clean.

- [ ] **Step 3: Commit**

```bash
git add app/console/page.tsx
git commit -m "feat(ui): org-admin admin/inviter list management + seed"
```

---

## Task 13: Docs + final verification

**Files:**
- Modify: `INSTALL.md`, `DEMO.md`

- [ ] **Step 1: Update docs**

- INSTALL.md: add a **Step "Seed Space Admins"** (click Seed in console after first deploy) and note the three personas + that Space Admins sign in the same way (OAuth) but see only their spaces.
- DEMO.md: add a short "Delegated governance" section — sign in as an org member who is a Space Admin of one space → they can manage only that space's roles/members; org admin sees all.

- [ ] **Step 2: Full verification**

Run: `. "$HOME/.nvm/nvm.sh" && nvm use 20 >/dev/null && npx vitest run 2>&1 | grep -E "Tests " && npm run typecheck 2>&1 | tail -1 && npm run build 2>&1 | grep -E "Compiled"`
Expected: all tests pass, typecheck clean, build compiles.

- [ ] **Step 3: Commit + push**

```bash
git add INSTALL.md DEMO.md
git commit -m "docs: delegated governance setup + demo"
git push origin <branch>
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Two permission layers / auth keyed off space vs org membership → Tasks 2, 6, 7.
- Three personas (Org Admin / Space Admin / Inviter) → Tasks 3, 7, 10, 11.
- Per-user deny granularity via per-space custom-role CRUD → Tasks 4, 5, 8, 11.
- Built-in super admin retained; govern by shifting to a role; assignment guardrail → Tasks 5, 8.
- Protected org admins/owners can't be re-roled/removed → Task 5 (`assignMemberRoleGuarded`), existing remove guardrail.
- Admin/inviter lists + hybrid seed sweep → Tasks 1, 9, 12.
- Block-and-prompt role deletion (Q3) → Tasks 4, 5, 8, 11.
- Easy setup → Task 9 `seedAll`, Task 12 button, Task 13 docs.

**Placeholder scan:** No TBD/TODO; every code step shows complete code. UI tasks (11/12) give the data-flow functions concretely; assemble into the existing page's JSX following its current style.

**Type consistency:** `Identity`, `SpaceAccessConfig`, `SpaceAccessInfo`/`PersonaResult`, `SpaceRole`, `ProtectedContext`, `DenyPolicy` are defined once and reused. Gate signatures `authorizeSpaceAccess(req, spaceId)` / `authorizeInviter(req, spaceId)` are consistent across Tasks 6/8/10. `getSpaceAccessConfig` / `setSpaceAccessConfig` consistent across Tasks 1/6/7/9.

**Known execution notes:** watch for an operations.ts ↔ require-request.ts circular import (Task 6 note); the governance space needs the `spaceGovernance` content type with `adminUserIds`/`inviterUserIds` Object fields — `scripts/bootstrap.ts` already creates `spaceGovernance` (it includes `inviterUserIds`; add `adminUserIds`/`lastSeededAt` there if missing during execution).
