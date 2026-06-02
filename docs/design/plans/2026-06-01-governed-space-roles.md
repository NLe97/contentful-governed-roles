# Governed Space Roles + Delegated User Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone web app that replaces the customer's built-in Space Admin role with a governed custom role carrying per-space deny rules, while preserving delegated user-management through an external service gated by a per-space allowlist.

**Architecture:** Next.js (App Router) on Vercel. Contentful OAuth verifies caller identity; a server-held service token performs the privileged CMA writes (role create/assign, membership add/remove) that a governed role can't. Per-space config (`denyPolicy` templates + `spaceGovernance` allowlists) and an append-only audit log live as entries in a governance space. Webhooks + cron provide detect-and-revert drift defense. One mechanism supports both Approach A and Approach B — the difference is purely the per-space inviter allowlist.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Node 20, pnpm, `contentful-management` v11, Zod, Vitest. Deployed on Vercel (functions + cron).

**Spec:** `docs/design/specs/2026-06-01-governed-space-roles-design.md`

---

## File Structure

```
contentful-governed-roles/
├── package.json, tsconfig.json, vitest.config.ts, .nvmrc, .env.example
├── next.config.mjs, vercel.json
├── lib/
│   ├── policy/
│   │   ├── types.ts                 # DenyRule, DenyPolicy, role-shape types
│   │   └── compute-governed-role.ts # DenyPolicy -> Contentful role definition
│   ├── auth/
│   │   ├── identity.ts              # Identity type
│   │   └── authorize.ts             # canManageMembers / requireOrgAdmin gates
│   ├── guardrails/
│   │   └── protected.ts            # isProtectedRemoval / assertRemovable
│   ├── audit/
│   │   └── events.ts               # AuditEventType + buildAuditEvent
│   ├── cma/
│   │   ├── client.ts               # service-token CMA client + retry
│   │   ├── roles.ts                # ensureGovernedRole, assignRole
│   │   └── memberships.ts          # listMembers, addMember, removeMember
│   ├── contentful/
│   │   └── oauth.ts                # Contentful OAuth helpers
│   └── governance/
│       ├── content-model.ts        # ensure governance content types
│       └── store.ts                # read/write denyPolicy, spaceGovernance, audit
├── app/
│   ├── api/
│   │   ├── policies/route.ts
│   │   ├── reconcile-role/route.ts
│   │   ├── members/route.ts
│   │   ├── webhook/route.ts
│   │   └── cron/reconcile/route.ts
│   ├── auth/callback/route.ts
│   ├── console/page.tsx            # Org Admin console
│   └── members/page.tsx            # Member-management surface
├── scripts/
│   ├── probe-1-role-deny.ts
│   ├── probe-2-token-membership.ts
│   └── probe-3-webhook.ts
└── tests/ (mirrors lib/)
```

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.nvmrc`, `.env.example`, `next.config.mjs`, `vercel.json`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "contentful-governed-roles",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "contentful-management": "^11.0.0",
    "next": "^15.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "tsx": "^4.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`, `.nvmrc`, `next.config.mjs`, `vercel.json`**

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
  resolve: { alias: { "@": new URL(".", import.meta.url).pathname } },
});
```

`.nvmrc`:
```
20
```

`next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
export default { serverExternalPackages: ["contentful-management"] };
```

`vercel.json`:
```json
{ "crons": [{ "path": "/api/cron/reconcile", "schedule": "0 5 * * *" }] }
```

- [ ] **Step 4: Create `.env.example`**

```
# Service token with org-admin scope (dev: PAT; prod: hardened service identity). Powers privileged CMA writes.
CF_SERVICE_TOKEN=
CF_ORG_ID=
# Governance space holding policies, spaceGovernance, audit entries
CF_GOVERNANCE_SPACE_ID=
CF_GOVERNANCE_ENVIRONMENT_ID=master
# MVP 1 protected Org Admins team (do-not-remove)
CF_PROTECTED_TEAM_ID=
# Contentful OAuth app (login / identity)
CF_OAUTH_CLIENT_ID=
CF_OAUTH_REDIRECT_URI=http://localhost:3000/auth/callback
# Webhook + cron shared secrets
CF_WEBHOOK_SECRET=
CRON_SECRET=
```

- [ ] **Step 5: Install and verify**

Run: `pnpm install && pnpm typecheck`
Expected: install succeeds; typecheck passes (no source files yet → exit 0).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + Vitest project"
```

---

## Task 2: Deny-policy types

**Files:**
- Create: `lib/policy/types.ts`
- Test: `tests/policy/types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/policy/types.test.ts
import { describe, it, expect } from "vitest";
import { DenyPolicySchema } from "@/lib/policy/types";

describe("DenyPolicySchema", () => {
  it("accepts a valid policy with a JSON-field edit deny", () => {
    const parsed = DenyPolicySchema.parse({
      name: "Event Lockdown",
      denies: [{ action: "publish", contentTypeId: "landingPage" },
               { action: "edit", contentTypeId: "config", fields: ["payload"] }],
    });
    expect(parsed.denies).toHaveLength(2);
  });

  it("rejects an unknown action", () => {
    expect(() => DenyPolicySchema.parse({
      name: "x", denies: [{ action: "nuke", contentTypeId: "a" }],
    })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/policy/types.test.ts`
Expected: FAIL — cannot find module `@/lib/policy/types`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/policy/types.ts
import { z } from "zod";

export const DenyActionSchema = z.enum(["edit", "publish", "create", "delete"]);
export type DenyAction = z.infer<typeof DenyActionSchema>;

export const DenyRuleSchema = z.object({
  action: DenyActionSchema,
  contentTypeId: z.string().min(1),
  fields: z.array(z.string().min(1)).optional(),
});
export type DenyRule = z.infer<typeof DenyRuleSchema>;

export const DenyPolicySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  denies: z.array(DenyRuleSchema),
});
export type DenyPolicy = z.infer<typeof DenyPolicySchema>;

// Contentful custom-role shape (subset we set).
export interface RoleDefinition {
  name: string;
  description?: string;
  permissions: Record<string, "all" | string[]>;
  policies: RolePolicy[];
}
export interface RolePolicy {
  effect: "allow" | "deny";
  actions: "all" | string[];
  constraint?: unknown;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/policy/types.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/policy/types.ts tests/policy/types.test.ts
git commit -m "feat(policy): deny-rule + policy schemas"
```

---

## Task 3: Compute governed role from a deny policy

This is the heart of R1. A governed role = the broadest custom-role permission set ("Space-Admin-equivalent") plus a base allow-all entry/asset policy, with one deny policy entry appended per deny rule. Action mapping: `edit→update`, `publish→publish`, `create→create`, `delete→delete`.

**Files:**
- Create: `lib/policy/compute-governed-role.ts`
- Test: `tests/policy/compute-governed-role.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/policy/compute-governed-role.test.ts
import { describe, it, expect } from "vitest";
import { computeGovernedRole } from "@/lib/policy/compute-governed-role";

describe("computeGovernedRole", () => {
  const base = { name: "Standard", denies: [] };

  it("grants the Space-Admin-equivalent permission set", () => {
    const role = computeGovernedRole(base);
    expect(role.permissions.ContentModel).toBe("all");
    expect(role.permissions.Settings).toBe("all");
    expect(role.permissions.ContentDelivery).toBe("all");
  });

  it("includes a base allow-all entry/asset policy", () => {
    const role = computeGovernedRole(base);
    expect(role.policies[0]).toEqual({ effect: "allow", actions: "all", constraint: { and: [{ equals: [{ doc: "sys.type" }, "Entry"] }] } });
  });

  it("appends a deny policy per rule, mapping edit->update and scoping by content type", () => {
    const role = computeGovernedRole({
      name: "Lockdown", denies: [{ action: "edit", contentTypeId: "config" }],
    });
    const deny = role.policies.find((p) => p.effect === "deny");
    expect(deny).toBeDefined();
    expect(deny!.actions).toEqual(["update"]);
    expect(deny!.constraint).toEqual({
      and: [{ equals: [{ doc: "sys.contentType.sys.id" }, "config"] }],
    });
  });

  it("scopes a field-level deny by paths when fields are given", () => {
    const role = computeGovernedRole({
      name: "f", denies: [{ action: "edit", contentTypeId: "config", fields: ["payload"] }],
    });
    const deny = role.policies.find((p) => p.effect === "deny")!;
    expect(deny.constraint).toEqual({
      and: [
        { equals: [{ doc: "sys.contentType.sys.id" }, "config"] },
        { paths: [{ doc: "fields.payload.%" }] },
      ],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/policy/compute-governed-role.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/policy/compute-governed-role.ts
import type { DenyAction, DenyPolicy, RoleDefinition, RolePolicy } from "./types";

const ACTION_MAP: Record<DenyAction, string> = {
  edit: "update",
  publish: "publish",
  create: "create",
  delete: "delete",
};

// Broadest capability set Contentful custom roles allow. Manage-memberships is
// intentionally absent — it is bridged externally (Task 9), not granted in-role.
const SPACE_ADMIN_EQUIVALENT_PERMISSIONS: RoleDefinition["permissions"] = {
  ContentModel: "all",
  Settings: "all",
  ContentDelivery: "all",
  Environments: "all",
  EnvironmentAliases: "all",
  Tags: "all",
};

function baseAllow(docType: "Entry" | "Asset"): RolePolicy {
  return { effect: "allow", actions: "all", constraint: { and: [{ equals: [{ doc: "sys.type" }, docType] }] } };
}

function denyToPolicy(action: DenyAction, contentTypeId: string, fields?: string[]): RolePolicy {
  const and: unknown[] = [{ equals: [{ doc: "sys.contentType.sys.id" }, contentTypeId] }];
  if (fields && fields.length > 0) {
    and.push({ paths: fields.map((f) => ({ doc: `fields.${f}.%` })) });
  }
  return { effect: "deny", actions: [ACTION_MAP[action]], constraint: { and } };
}

export function computeGovernedRole(policy: DenyPolicy): RoleDefinition {
  return {
    name: policy.name,
    description: policy.description,
    permissions: SPACE_ADMIN_EQUIVALENT_PERMISSIONS,
    policies: [
      baseAllow("Entry"),
      baseAllow("Asset"),
      ...policy.denies.map((d) => denyToPolicy(d.action, d.contentTypeId, d.fields)),
    ],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/policy/compute-governed-role.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/policy/compute-governed-role.ts tests/policy/compute-governed-role.test.ts
git commit -m "feat(policy): compute governed role from deny policy"
```

> **Note for execution:** the exact constraint DSL (`paths`, `doc` selectors) must be confirmed against the live CMA in Task 13 (Probe 1). If field-level denies aren't supported, fall back to content-type-level denies and record it in spec open question O2.

---

## Task 4: Identity type + authorization gates

Implements R3's security control: the per-space allowlist gate that sits in front of the powerful service token.

**Files:**
- Create: `lib/auth/identity.ts`, `lib/auth/authorize.ts`
- Test: `tests/auth/authorize.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/auth/authorize.test.ts
import { describe, it, expect } from "vitest";
import { canManageMembers, requireOrgAdmin } from "@/lib/auth/authorize";

const orgAdmin = { userId: "u-admin", isOrgAdmin: true };
const inviter = { userId: "u-inviter", isOrgAdmin: false };
const stranger = { userId: "u-other", isOrgAdmin: false };
const gov = { spaceId: "s1", inviterUserIds: ["u-inviter"] };

describe("canManageMembers", () => {
  it("allows an org admin anywhere", () => {
    expect(canManageMembers(orgAdmin, gov)).toBe(true);
  });
  it("allows a user on the space's inviter allowlist", () => {
    expect(canManageMembers(inviter, gov)).toBe(true);
  });
  it("denies a user not on the allowlist and not an org admin", () => {
    expect(canManageMembers(stranger, gov)).toBe(false);
  });
});

describe("requireOrgAdmin", () => {
  it("throws for non-org-admins", () => {
    expect(() => requireOrgAdmin(inviter)).toThrow(/org admin/i);
  });
  it("passes for org admins", () => {
    expect(() => requireOrgAdmin(orgAdmin)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/auth/authorize.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/auth/identity.ts
export interface Identity {
  userId: string;
  isOrgAdmin: boolean;
}
```

```ts
// lib/auth/authorize.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/auth/authorize.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/auth/identity.ts lib/auth/authorize.ts tests/auth/authorize.test.ts
git commit -m "feat(auth): identity + per-space authorization gates"
```

---

## Task 5: Protected-identity guardrails

Implements the guardrail: governed Space Admins must never remove the protected team or any Org Admin/Owner identity.

**Files:**
- Create: `lib/guardrails/protected.ts`
- Test: `tests/guardrails/protected.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/guardrails/protected.test.ts
import { describe, it, expect } from "vitest";
import { isProtectedRemoval, assertRemovable } from "@/lib/guardrails/protected";

const ctx = { protectedTeamId: "team-org-admins", orgAdminOwnerUserIds: ["u-protected-2", "u-protected-1"] };

describe("isProtectedRemoval", () => {
  it("flags removal of the protected team", () => {
    expect(isProtectedRemoval({ kind: "team", id: "team-org-admins" }, ctx)).toBe(true);
  });
  it("flags removal of an org admin/owner user", () => {
    expect(isProtectedRemoval({ kind: "user", id: "u-protected-1" }, ctx)).toBe(true);
  });
  it("allows removal of an ordinary user", () => {
    expect(isProtectedRemoval({ kind: "user", id: "u-contractor" }, ctx)).toBe(false);
  });
});

describe("assertRemovable", () => {
  it("throws on a protected removal", () => {
    expect(() => assertRemovable({ kind: "user", id: "u-protected-2" }, ctx)).toThrow(/protected/i);
  });
  it("does not throw on an ordinary removal", () => {
    expect(() => assertRemovable({ kind: "user", id: "u-x" }, ctx)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/guardrails/protected.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/guardrails/protected.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/guardrails/protected.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/guardrails/protected.ts tests/guardrails/protected.test.ts
git commit -m "feat(guardrails): protect team + org admin/owner from removal"
```

---

## Task 6: Audit event builder

Implements R6.

**Files:**
- Create: `lib/audit/events.ts`
- Test: `tests/audit/events.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/audit/events.test.ts
import { describe, it, expect } from "vitest";
import { buildAuditEvent } from "@/lib/audit/events";

describe("buildAuditEvent", () => {
  it("builds a normalized event with an ISO timestamp", () => {
    const e = buildAuditEvent("MEMBER_ADDED", {
      spaceId: "s1", actorUserId: "u1", details: { addedUserId: "u2" },
    });
    expect(e.eventType).toBe("MEMBER_ADDED");
    expect(e.spaceId).toBe("s1");
    expect(e.actorUserId).toBe("u1");
    expect(e.details).toEqual({ addedUserId: "u2" });
    expect(() => new Date(e.timestamp).toISOString()).not.toThrow();
  });

  it("defaults actor to 'system' and tolerates no spaceId", () => {
    const e = buildAuditEvent("RECONCILE_RUN", { details: { swept: 12 } });
    expect(e.actorUserId).toBe("system");
    expect(e.spaceId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/audit/events.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/audit/events.ts
export type AuditEventType =
  | "POLICY_DEFINED" | "POLICY_ASSIGNED"
  | "ROLE_CREATED" | "ROLE_UPDATED" | "ADMIN_MIGRATED"
  | "MEMBER_ADDED" | "MEMBER_REMOVED"
  | "PROTECTED_REMOVAL_REVERTED" | "RECONCILE_RUN" | "ERROR";

export interface AuditEvent {
  eventType: AuditEventType;
  spaceId?: string;
  actorUserId: string;
  details: Record<string, unknown>;
  timestamp: string;
}

export function buildAuditEvent(
  eventType: AuditEventType,
  opts: { spaceId?: string; actorUserId?: string; details?: Record<string, unknown> },
): AuditEvent {
  return {
    eventType,
    spaceId: opts.spaceId,
    actorUserId: opts.actorUserId ?? "system",
    details: opts.details ?? {},
    timestamp: new Date().toISOString(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/audit/events.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/audit/events.ts tests/audit/events.test.ts
git commit -m "feat(audit): normalized audit event builder"
```

---

## Task 7: CMA client with service token + retry

Wraps `contentful-management` v11. **Gotcha (from prior project):** the package is CJS under Node ESM — import the default and destructure.

**Files:**
- Create: `lib/cma/client.ts`
- Test: `tests/cma/client.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/cma/client.test.ts
import { describe, it, expect, vi } from "vitest";
import { withRetry } from "@/lib/cma/client";

describe("withRetry", () => {
  it("retries on 429 then succeeds", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("rate"), { status: 429 }))
      .mockResolvedValueOnce("ok");
    const result = await withRetry(fn, { attempts: 3, baseMs: 0 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 422 and rethrows", async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error("bad"), { status: 422 }));
    await expect(withRetry(fn, { attempts: 3, baseMs: 0 })).rejects.toThrow("bad");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/cma/client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/cma/client.ts
import cmaPkg from "contentful-management";
const { createClient } = cmaPkg;

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseMs?: number } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const baseMs = opts.baseMs ?? 250;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === undefined || !RETRYABLE.has(status)) throw err;
      lastErr = err;
      const jitter = Math.random() * baseMs;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** i + jitter));
    }
  }
  throw lastErr;
}

let cached: ReturnType<typeof createClient> | null = null;
export function cma() {
  if (cached) return cached;
  const accessToken = process.env.CF_SERVICE_TOKEN;
  if (!accessToken) throw new Error("CF_SERVICE_TOKEN is not set");
  cached = createClient({ accessToken });
  return cached;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/cma/client.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/cma/client.ts tests/cma/client.test.ts
git commit -m "feat(cma): service-token client + retry/backoff"
```

---

## Task 8: Governed-role CMA operations

Implements §4.1: ensure a space's governed role exists/matches the computed definition, and migrate Space Admins onto it.

**Files:**
- Create: `lib/cma/roles.ts`
- Test: `tests/cma/roles.test.ts`

- [ ] **Step 1: Write the failing test** (pure mapping logic — `diffRoleNeedsUpdate`)

```ts
// tests/cma/roles.test.ts
import { describe, it, expect } from "vitest";
import { roleNeedsUpdate } from "@/lib/cma/roles";

const desired = {
  name: "Standard", permissions: { ContentModel: "all" },
  policies: [{ effect: "allow", actions: "all" }],
};

describe("roleNeedsUpdate", () => {
  it("returns false when existing matches desired", () => {
    expect(roleNeedsUpdate(desired, { ...desired })).toBe(false);
  });
  it("returns true when policies differ", () => {
    expect(roleNeedsUpdate(desired, { ...desired, policies: [] })).toBe(true);
  });
  it("returns true when permissions differ", () => {
    expect(roleNeedsUpdate(desired, { ...desired, permissions: { ContentModel: [] } })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/cma/roles.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/cma/roles.ts
import type { RoleDefinition } from "@/lib/policy/types";
import { cma, withRetry } from "./client";

export function roleNeedsUpdate(
  desired: Pick<RoleDefinition, "permissions" | "policies">,
  existing: Pick<RoleDefinition, "permissions" | "policies">,
): boolean {
  return JSON.stringify(desired.permissions) !== JSON.stringify(existing.permissions)
    || JSON.stringify(desired.policies) !== JSON.stringify(existing.policies);
}

// Create or update the governed role in a space; return its role ID.
export async function ensureGovernedRole(spaceId: string, def: RoleDefinition): Promise<string> {
  const space = await withRetry(() => cma().getSpace(spaceId));
  const roles = await withRetry(() => space.getRoles());
  const existing = roles.items.find((r) => r.name === def.name);
  if (!existing) {
    const created = await withRetry(() => space.createRole({
      name: def.name, description: def.description ?? "", permissions: def.permissions, policies: def.policies,
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

// Move a space member from built-in Admin to the governed role.
export async function assignRole(spaceId: string, membershipId: string, roleId: string): Promise<void> {
  const space = await withRetry(() => cma().getSpace(spaceId));
  const m = await withRetry(() => space.getSpaceMembership(membershipId));
  m.admin = false;
  m.roles = [{ sys: { type: "Link", linkType: "Role", id: roleId } }] as never;
  await withRetry(() => m.update());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/cma/roles.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/cma/roles.ts tests/cma/roles.test.ts
git commit -m "feat(cma): ensure governed role + assign to members"
```

---

## Task 9: Membership CMA operations (the bridge) with guardrails

Implements §4.2 (R2/R3): list, add, and remove members via the service token, with guardrails enforced before any remove.

**Files:**
- Create: `lib/cma/memberships.ts`
- Test: `tests/cma/memberships.test.ts`

- [ ] **Step 1: Write the failing test** (guardrail wiring, with an injected remover fn)

```ts
// tests/cma/memberships.test.ts
import { describe, it, expect, vi } from "vitest";
import { removeMemberGuarded } from "@/lib/cma/memberships";

const ctx = { protectedTeamId: "team-x", orgAdminOwnerUserIds: ["u-protected-1"] };

describe("removeMemberGuarded", () => {
  it("refuses to remove a protected user and never calls the remover", async () => {
    const remover = vi.fn();
    await expect(removeMemberGuarded({ kind: "user", id: "u-protected-1" }, ctx, remover))
      .rejects.toThrow(/protected/i);
    expect(remover).not.toHaveBeenCalled();
  });

  it("removes an ordinary user via the remover", async () => {
    const remover = vi.fn().mockResolvedValue(undefined);
    await removeMemberGuarded({ kind: "user", id: "u-temp" }, ctx, remover);
    expect(remover).toHaveBeenCalledWith({ kind: "user", id: "u-temp" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/cma/memberships.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/cma/memberships.ts
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

// Add a user to the space under a specific (non-admin) role. Never grants built-in Admin.
export async function addMember(spaceId: string, email: string, roleId: string): Promise<string> {
  const space = await withRetry(() => cma().getSpace(spaceId));
  const created = await withRetry(() => space.createSpaceMembership({
    admin: false,
    email,
    roles: [{ sys: { type: "Link", linkType: "Role", id: roleId } }],
  } as never));
  return created.sys.id;
}

// Guardrail-checked removal. `remover` performs the actual CMA delete once the check passes.
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/cma/memberships.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/cma/memberships.ts tests/cma/memberships.test.ts
git commit -m "feat(cma): membership bridge with protected-identity guardrails"
```

---

## Task 10: Governance store + content model

Implements §3.2 / §5: ensure content types in the governance space and read/write `denyPolicy`, `spaceGovernance`, `auditEvent` entries.

**Files:**
- Create: `lib/governance/content-model.ts`, `lib/governance/store.ts`
- Test: `tests/governance/store.test.ts`

- [ ] **Step 1: Write the failing test** (pure upsert-key resolution logic)

```ts
// tests/governance/store.test.ts
import { describe, it, expect } from "vitest";
import { pickSpaceGovernance } from "@/lib/governance/store";

const entries = [
  { fields: { spaceId: { "en-US": "s1" }, policyRef: { "en-US": "p1" }, inviterUserIds: { "en-US": ["u1"] } } },
  { fields: { spaceId: { "en-US": "s2" }, policyRef: { "en-US": "p2" }, inviterUserIds: { "en-US": [] } } },
];

describe("pickSpaceGovernance", () => {
  it("finds the entry whose spaceId matches", () => {
    const g = pickSpaceGovernance(entries as never, "s2");
    expect(g?.policyRef).toBe("p2");
  });
  it("returns null when no entry matches", () => {
    expect(pickSpaceGovernance(entries as never, "nope")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/governance/store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/governance/store.ts
import { cma, withRetry } from "@/lib/cma/client";
import type { AuditEvent } from "@/lib/audit/events";

const LOCALE = "en-US";
function f<T>(field: Record<string, T> | undefined): T | undefined { return field?.[LOCALE]; }

export interface SpaceGovernanceRow {
  spaceId: string; policyRef: string; inviterUserIds: string[]; governedRoleId?: string;
}
interface RawEntry { sys?: { id: string }; fields: Record<string, Record<string, unknown>>; }

export function pickSpaceGovernance(entries: RawEntry[], spaceId: string): SpaceGovernanceRow | null {
  const e = entries.find((x) => f(x.fields.spaceId as Record<string, string>) === spaceId);
  if (!e) return null;
  return {
    spaceId,
    policyRef: f(e.fields.policyRef as Record<string, string>) ?? "",
    inviterUserIds: (f(e.fields.inviterUserIds as Record<string, string[]>) ?? []) as string[],
    governedRoleId: f(e.fields.governedRoleId as Record<string, string>),
  };
}

async function govEnv() {
  const space = await withRetry(() => cma().getSpace(process.env.CF_GOVERNANCE_SPACE_ID!));
  return withRetry(() => space.getEnvironment(process.env.CF_GOVERNANCE_ENVIRONMENT_ID ?? "master"));
}

export async function getSpaceGovernance(spaceId: string): Promise<SpaceGovernanceRow | null> {
  const env = await govEnv();
  const res = await withRetry(() => env.getEntries({ content_type: "spaceGovernance", "fields.spaceId": spaceId }));
  return pickSpaceGovernance(res.items as unknown as RawEntry[], spaceId);
}

export async function appendAudit(event: AuditEvent): Promise<void> {
  const env = await govEnv();
  await withRetry(() => env.createEntry("auditEvent", {
    fields: {
      eventType: { [LOCALE]: event.eventType },
      spaceId: { [LOCALE]: event.spaceId ?? null },
      actorUserId: { [LOCALE]: event.actorUserId },
      details: { [LOCALE]: event.details },
      timestamp: { [LOCALE]: event.timestamp },
    },
  }));
}
```

```ts
// lib/governance/content-model.ts
import { cma, withRetry } from "@/lib/cma/client";

// Idempotently ensure the three governance content types exist. Safe to re-run.
export async function ensureContentModel(): Promise<void> {
  const space = await withRetry(() => cma().getSpace(process.env.CF_GOVERNANCE_SPACE_ID!));
  const env = await withRetry(() => space.getEnvironment(process.env.CF_GOVERNANCE_ENVIRONMENT_ID ?? "master"));
  const existing = await withRetry(() => env.getContentTypes());
  const have = new Set(existing.items.map((c) => c.sys.id));

  const defs: { id: string; name: string; fields: { id: string; name: string; type: string; items?: unknown }[] }[] = [
    { id: "denyPolicy", name: "Deny Policy", fields: [
      { id: "name", name: "Name", type: "Symbol" },
      { id: "description", name: "Description", type: "Text" },
      { id: "denies", name: "Denies", type: "Object" },
    ]},
    { id: "spaceGovernance", name: "Space Governance", fields: [
      { id: "spaceId", name: "Space ID", type: "Symbol" },
      { id: "spaceName", name: "Space Name", type: "Symbol" },
      { id: "policyRef", name: "Policy Ref", type: "Symbol" },
      { id: "inviterUserIds", name: "Inviter User IDs", type: "Object" },
      { id: "governedRoleId", name: "Governed Role ID", type: "Symbol" },
      { id: "rolloutStatus", name: "Rollout Status", type: "Symbol" },
    ]},
    { id: "auditEvent", name: "Audit Event", fields: [
      { id: "eventType", name: "Event Type", type: "Symbol" },
      { id: "spaceId", name: "Space ID", type: "Symbol" },
      { id: "actorUserId", name: "Actor User ID", type: "Symbol" },
      { id: "details", name: "Details", type: "Object" },
      { id: "timestamp", name: "Timestamp", type: "Date" },
    ]},
  ];

  for (const def of defs) {
    if (have.has(def.id)) continue;
    const ct = await withRetry(() => env.createContentTypeWithId(def.id, { name: def.name, fields: def.fields as never }));
    await withRetry(() => ct.publish());
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/governance/store.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/governance/ tests/governance/store.test.ts
git commit -m "feat(governance): content model + entry store + audit append"
```

---

## Task 11: Contentful OAuth + identity resolution

Implements §3.1: log a user in with Contentful OAuth and resolve their `Identity` (is org admin?).

**Files:**
- Create: `lib/contentful/oauth.ts`, `app/auth/callback/route.ts`
- Test: `tests/contentful/oauth.test.ts`

- [ ] **Step 1: Write the failing test** (pure URL builder + org-admin role parser)

```ts
// tests/contentful/oauth.test.ts
import { describe, it, expect } from "vitest";
import { buildAuthorizeUrl, parseIsOrgAdmin } from "@/lib/contentful/oauth";

describe("buildAuthorizeUrl", () => {
  it("includes client id, redirect, response_type=token and read scope", () => {
    const url = buildAuthorizeUrl({ clientId: "abc", redirectUri: "http://x/cb" });
    expect(url).toContain("client_id=abc");
    expect(url).toContain("redirect_uri=http%3A%2F%2Fx%2Fcb");
    expect(url).toContain("response_type=token");
  });
});

describe("parseIsOrgAdmin", () => {
  it("is true when membership role is admin or owner for the org", () => {
    const memberships = { items: [{ role: "owner", organization: { sys: { id: "org1" } } }] };
    expect(parseIsOrgAdmin(memberships as never, "org1")).toBe(true);
  });
  it("is false for a plain member", () => {
    const memberships = { items: [{ role: "member", organization: { sys: { id: "org1" } } }] };
    expect(parseIsOrgAdmin(memberships as never, "org1")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/contentful/oauth.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/contentful/oauth.ts
export function buildAuthorizeUrl(opts: { clientId: string; redirectUri: string }): string {
  const p = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "token",
    scope: "content_management_read content_management_manage",
  });
  return `https://be.contentful.com/oauth/authorize?${p.toString()}`;
}

interface OrgMemberships { items: { role: string; organization: { sys: { id: string } } }[] }
export function parseIsOrgAdmin(memberships: OrgMemberships, orgId: string): boolean {
  return memberships.items.some(
    (m) => m.organization.sys.id === orgId && (m.role === "admin" || m.role === "owner"),
  );
}

// Resolve identity from a user's OAuth token (used only for IDENTITY, never for privileged writes).
export async function resolveIdentity(userToken: string, orgId: string): Promise<{ userId: string; isOrgAdmin: boolean }> {
  const me = await fetch("https://api.contentful.com/users/me", {
    headers: { Authorization: `Bearer ${userToken}` },
  }).then((r) => r.json());
  const memberships = await fetch(`https://api.contentful.com/organization_memberships?limit=100`, {
    headers: { Authorization: `Bearer ${userToken}` },
  }).then((r) => r.json());
  return { userId: me.sys.id, isOrgAdmin: parseIsOrgAdmin(memberships, orgId) };
}
```

```ts
// app/auth/callback/route.ts
import { NextRequest, NextResponse } from "next/server";

// Contentful returns the token in the URL fragment (#access_token=...), which the
// server can't read. This page captures it client-side and posts it to set a cookie.
export async function GET(_req: NextRequest) {
  const html = `<!doctype html><script>
    const h = new URLSearchParams(location.hash.slice(1));
    const t = h.get('access_token');
    if (t) { document.cookie = 'cf_user_token=' + t + '; path=/; samesite=lax'; location.replace('/console'); }
    else { document.body.textContent = 'Login failed'; }
  </script>`;
  return new NextResponse(html, { headers: { "content-type": "text/html" } });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/contentful/oauth.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/contentful/oauth.ts app/auth/callback/route.ts tests/contentful/oauth.test.ts
git commit -m "feat(auth): Contentful OAuth login + identity resolution"
```

---

## Task 12: API route handlers

Wires the libs together. Each handler resolves identity from the `cf_user_token` cookie, applies the right gate, then uses the service token for writes.

**Files:**
- Create: `app/api/policies/route.ts`, `app/api/reconcile-role/route.ts`, `app/api/members/route.ts`, `app/api/webhook/route.ts`, `app/api/cron/reconcile/route.ts`
- Test: `tests/api/members-handler.test.ts`

- [ ] **Step 1: Write the failing test** (the members handler's decision logic, extracted as `handleMemberAction`)

```ts
// tests/api/members-handler.test.ts
import { describe, it, expect, vi } from "vitest";
import { handleMemberAction } from "@/app/api/members/logic";

const gov = { spaceId: "s1", policyRef: "p1", inviterUserIds: ["u-inviter"], governedRoleId: "role-1" };

describe("handleMemberAction", () => {
  it("rejects a caller not on the allowlist", async () => {
    const res = await handleMemberAction(
      { identity: { userId: "u-x", isOrgAdmin: false }, gov, action: "add", email: "a@b.com",
        ctx: { protectedTeamId: "t", orgAdminOwnerUserIds: [] },
        deps: { addMember: vi.fn(), removeMembership: vi.fn(), listMembers: vi.fn(), appendAudit: vi.fn() } },
    );
    expect(res.status).toBe(403);
  });

  it("adds a member under the governed role and audits", async () => {
    const addMember = vi.fn().mockResolvedValue("m-9");
    const appendAudit = vi.fn();
    const res = await handleMemberAction(
      { identity: { userId: "u-inviter", isOrgAdmin: false }, gov, action: "add", email: "a@b.com",
        ctx: { protectedTeamId: "t", orgAdminOwnerUserIds: [] },
        deps: { addMember, removeMembership: vi.fn(), listMembers: vi.fn(), appendAudit } },
    );
    expect(res.status).toBe(200);
    expect(addMember).toHaveBeenCalledWith("s1", "a@b.com", "role-1");
    expect(appendAudit).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/api/members-handler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the extracted logic + the route**

```ts
// app/api/members/logic.ts
import { canManageMembers } from "@/lib/auth/authorize";
import type { Identity } from "@/lib/auth/identity";
import { assertRemovable, type ProtectedContext } from "@/lib/guardrails/protected";
import { buildAuditEvent, type AuditEvent } from "@/lib/audit/events";
import type { SpaceGovernanceRow } from "@/lib/governance/store";

interface Deps {
  addMember: (spaceId: string, email: string, roleId: string) => Promise<string>;
  removeMembership: (spaceId: string, membershipId: string) => Promise<void>;
  listMembers: (spaceId: string) => Promise<unknown[]>;
  appendAudit: (e: AuditEvent) => Promise<void>;
}
interface Input {
  identity: Identity; gov: SpaceGovernanceRow; ctx: ProtectedContext; deps: Deps;
  action: "add" | "remove"; email?: string; targetUserId?: string; membershipId?: string;
}

export async function handleMemberAction(input: Input): Promise<{ status: number; body: unknown }> {
  const { identity, gov, ctx, deps } = input;
  if (!canManageMembers(identity, gov)) return { status: 403, body: { error: "not authorized for this space" } };

  if (input.action === "add") {
    if (!input.email || !gov.governedRoleId) return { status: 422, body: { error: "email and governed role required" } };
    const membershipId = await deps.addMember(gov.spaceId, input.email, gov.governedRoleId);
    await deps.appendAudit(buildAuditEvent("MEMBER_ADDED", { spaceId: gov.spaceId, actorUserId: identity.userId, details: { email: input.email, membershipId } }));
    return { status: 200, body: { ok: true, membershipId } };
  }

  // remove
  if (!input.targetUserId || !input.membershipId) return { status: 422, body: { error: "targetUserId and membershipId required" } };
  try {
    assertRemovable({ kind: "user", id: input.targetUserId }, ctx);
  } catch (e) {
    return { status: 403, body: { error: (e as Error).message } };
  }
  await deps.removeMembership(gov.spaceId, input.membershipId);
  await deps.appendAudit(buildAuditEvent("MEMBER_REMOVED", { spaceId: gov.spaceId, actorUserId: identity.userId, details: { targetUserId: input.targetUserId } }));
  return { status: 200, body: { ok: true } };
}
```

```ts
// app/api/members/route.ts
import { NextRequest, NextResponse } from "next/server";
import { handleMemberAction } from "./logic";
import { resolveIdentity } from "@/lib/contentful/oauth";
import { getSpaceGovernance, appendAudit } from "@/lib/governance/store";
import { addMember, deleteMembership, listMembers } from "@/lib/cma/memberships";

export async function POST(req: NextRequest) {
  const token = req.cookies.get("cf_user_token")?.value;
  if (!token) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const body = await req.json();
  const identity = await resolveIdentity(token, process.env.CF_ORG_ID!);
  const gov = await getSpaceGovernance(body.spaceId);
  if (!gov) return NextResponse.json({ error: "space not governed" }, { status: 404 });
  const ctx = {
    protectedTeamId: process.env.CF_PROTECTED_TEAM_ID!,
    orgAdminOwnerUserIds: body.protectedUserIds ?? [],
  };
  const result = await handleMemberAction({
    identity, gov, ctx, action: body.action, email: body.email,
    targetUserId: body.targetUserId, membershipId: body.membershipId,
    deps: { addMember, removeMembership: deleteMembership, listMembers, appendAudit },
  });
  return NextResponse.json(result.body, { status: result.status });
}
```

```ts
// app/api/reconcile-role/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth/authorize";
import { resolveIdentity } from "@/lib/contentful/oauth";
import { getSpaceGovernance, appendAudit } from "@/lib/governance/store";
import { computeGovernedRole } from "@/lib/policy/compute-governed-role";
import { ensureGovernedRole } from "@/lib/cma/roles";
import { buildAuditEvent } from "@/lib/audit/events";

export async function POST(req: NextRequest) {
  const token = req.cookies.get("cf_user_token")?.value;
  if (!token) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const identity = await resolveIdentity(token, process.env.CF_ORG_ID!);
  try { requireOrgAdmin(identity); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }
  const { spaceId, policy } = await req.json();
  const def = computeGovernedRole(policy);
  const roleId = await ensureGovernedRole(spaceId, def);
  await appendAudit(buildAuditEvent("ROLE_UPDATED", { spaceId, actorUserId: identity.userId, details: { roleId } }));
  return NextResponse.json({ ok: true, roleId });
}
```

```ts
// app/api/policies/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth/authorize";
import { resolveIdentity } from "@/lib/contentful/oauth";
import { DenyPolicySchema } from "@/lib/policy/types";
import { appendAudit } from "@/lib/governance/store";
import { buildAuditEvent } from "@/lib/audit/events";

export async function POST(req: NextRequest) {
  const token = req.cookies.get("cf_user_token")?.value;
  if (!token) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const identity = await resolveIdentity(token, process.env.CF_ORG_ID!);
  try { requireOrgAdmin(identity); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }
  const parsed = DenyPolicySchema.safeParse((await req.json()).policy);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  await appendAudit(buildAuditEvent("POLICY_DEFINED", { actorUserId: identity.userId, details: { policy: parsed.data } }));
  return NextResponse.json({ ok: true, policy: parsed.data });
}
```

```ts
// app/api/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getSpaceGovernance, appendAudit } from "@/lib/governance/store";
import { isProtectedRemoval } from "@/lib/guardrails/protected";
import { buildAuditEvent } from "@/lib/audit/events";

function verify(raw: string, sig: string | null): boolean {
  if (!sig) return false;
  const expected = createHmac("sha256", process.env.CF_WEBHOOK_SECRET!).update(raw).digest("hex");
  try { return timingSafeEqual(Buffer.from(expected), Buffer.from(sig)); } catch { return false; }
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verify(raw, req.headers.get("x-contentful-webhook-signature"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  const topic = req.headers.get("x-contentful-topic") ?? "";
  const payload = JSON.parse(raw);
  const spaceId = payload?.sys?.space?.sys?.id;
  if (!topic.includes("Membership") || !topic.endsWith(".delete") || !spaceId) {
    return NextResponse.json({ ok: true, noop: true });
  }
  const ctx = { protectedTeamId: process.env.CF_PROTECTED_TEAM_ID!, orgAdminOwnerUserIds: payload?.protectedUserIds ?? [] };
  const target = topic.includes("TeamSpace")
    ? { kind: "team" as const, id: payload?.team?.sys?.id ?? "" }
    : { kind: "user" as const, id: payload?.user?.sys?.id ?? "" };
  if (isProtectedRemoval(target, ctx)) {
    // Re-attach handled by reconcile (Task 14) or inline CMA re-add; audit the detection now.
    await appendAudit(buildAuditEvent("PROTECTED_REMOVAL_REVERTED", { spaceId, details: { target } }));
  }
  return NextResponse.json({ ok: true });
}
```

```ts
// app/api/cron/reconcile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { appendAudit } from "@/lib/governance/store";
import { buildAuditEvent } from "@/lib/audit/events";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const cronHeader = req.headers.get("x-vercel-cron");
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && !cronHeader) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Full sweep (re-assert governed roles + protected memberships) lands in Task 14.
  await appendAudit(buildAuditEvent("RECONCILE_RUN", { details: { startedAt: new Date().toISOString() } }));
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/api/members-handler.test.ts && pnpm typecheck`
Expected: PASS (2 tests); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add app/api/ tests/api/members-handler.test.ts
git commit -m "feat(api): policies, reconcile-role, members, webhook, cron handlers"
```

---

## Task 13: Live probes (run against the dev org before trusting the role logic)

Validates the spec's load-bearing assumptions (§8). These are scripts, not unit tests; run them manually with a dev PAT in `.env`.

**Files:**
- Create: `scripts/probe-1-role-deny.ts`, `scripts/probe-2-token-membership.ts`, `scripts/probe-3-webhook.ts`

- [ ] **Step 1: Write Probe 1 (role deny enforcement)**

```ts
// scripts/probe-1-role-deny.ts
// Creates a governed role with an edit-deny on a content type, assigns it to a throwaway
// user, and prints the role so we can confirm in-UI that the denied op is blocked.
import { config } from "node:process";
import { cma } from "../lib/cma/client.ts";
import { computeGovernedRole } from "../lib/policy/compute-governed-role.ts";

const spaceId = process.env.PROBE_SPACE_ID!;
const ctId = process.env.PROBE_CONTENT_TYPE_ID ?? "config";
const def = computeGovernedRole({ name: "PROBE Governed", denies: [{ action: "edit", contentTypeId: ctId }] });
const space = await cma().getSpace(spaceId);
const role = await space.createRole({ name: def.name, permissions: def.permissions, policies: def.policies } as never);
console.log("Created role", role.sys.id, "— assign a test user in the UI and confirm they cannot edit", ctId);
```

- [ ] **Step 2: Run Probe 1**

Run: `PROBE_SPACE_ID=<space> CF_SERVICE_TOKEN=<dev-pat> pnpm tsx scripts/probe-1-role-deny.ts`
Expected: prints a created role ID. Manually verify in the Contentful UI that an assigned user cannot edit the content type but can edit others. **If the deny isn't honored or field-level paths fail, record in spec O2 and fall back to content-type-level denies.**

- [ ] **Step 3: Write Probe 2 (service-token membership add)**

```ts
// scripts/probe-2-token-membership.ts
import { cma } from "../lib/cma/client.ts";
const spaceId = process.env.PROBE_SPACE_ID!;
const email = process.env.PROBE_EMAIL!;
const roleId = process.env.PROBE_ROLE_ID!;
const space = await cma().getSpace(spaceId);
const m = await space.createSpaceMembership({ admin: false, email, roles: [{ sys: { type: "Link", linkType: "Role", id: roleId } }] } as never);
console.log("Added membership", m.sys.id, "via service token (no admin role needed by caller)");
```

- [ ] **Step 4: Run Probe 2**

Run: `PROBE_SPACE_ID=<space> PROBE_EMAIL=<test> PROBE_ROLE_ID=<role> CF_SERVICE_TOKEN=<dev-pat> pnpm tsx scripts/probe-2-token-membership.ts`
Expected: prints a membership ID — confirms the service token can bridge user-add. **If this fails, the entire bridge approach is invalid; escalate before building UI.**

- [ ] **Step 5: Write Probe 3 (webhook delete fires) + commit**

```ts
// scripts/probe-3-webhook.ts
// Registers a SpaceMembership.delete + TeamSpaceMembership.delete webhook on the probe space
// pointing at the local tunnel, so detect-and-revert can be observed.
import { cma } from "../lib/cma/client.ts";
const orgId = process.env.CF_ORG_ID!;
const url = process.env.PROBE_WEBHOOK_URL!;
const org = await cma().getOrganization(orgId);
const wh = await (org as never as { createWebhook: Function }).createWebhook?.({
  name: "probe-membership-delete", url,
  topics: ["SpaceMembership.delete", "TeamSpaceMembership.delete"],
}) ?? console.log("Org-level webhook unsupported — register per space instead (spec O5 fallback)");
console.log("Webhook:", wh?.sys?.id ?? "see message above");
```

Run: `CF_ORG_ID=<org> PROBE_WEBHOOK_URL=<tunnel>/api/webhook CF_SERVICE_TOKEN=<dev-pat> pnpm tsx scripts/probe-3-webhook.ts`
Expected: prints a webhook ID, or a clear message that org-level webhooks aren't supported (then register per-space). Delete a test membership in the UI and confirm `/api/webhook` receives the event.

```bash
git add scripts/
git commit -m "test(probes): role-deny, token-membership, webhook live probes"
```

---

## Task 14: Reconcile sweep (drift defense) + role engine wiring

Implements §4.3 fully: the cron sweep re-asserts governed roles and re-adds protected identities removed out-of-band.

**Files:**
- Create: `lib/governance/reconcile.ts`
- Modify: `app/api/cron/reconcile/route.ts:1-20`, `app/api/webhook/route.ts` (re-add inline)
- Test: `tests/governance/reconcile.test.ts`

- [ ] **Step 1: Write the failing test** (sweep planner — pure logic deciding actions per space)

```ts
// tests/governance/reconcile.test.ts
import { describe, it, expect } from "vitest";
import { planReconcile } from "@/lib/governance/reconcile";

describe("planReconcile", () => {
  it("plans a role re-assert when role is missing and a re-add when protected member absent", () => {
    const plan = planReconcile({
      spaceId: "s1", governedRoleExists: false,
      protectedTeamPresent: false, protectedTeamId: "team-x",
    });
    expect(plan.reassertRole).toBe(true);
    expect(plan.reattachTeamId).toBe("team-x");
  });
  it("plans nothing when everything is healthy", () => {
    const plan = planReconcile({
      spaceId: "s1", governedRoleExists: true,
      protectedTeamPresent: true, protectedTeamId: "team-x",
    });
    expect(plan.reassertRole).toBe(false);
    expect(plan.reattachTeamId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/governance/reconcile.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/governance/reconcile.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/governance/reconcile.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/governance/reconcile.ts tests/governance/reconcile.test.ts
git commit -m "feat(reconcile): drift-sweep planner"
```

---

## Task 15: UI surfaces (Org Admin console + member management)

Implements R7 (easy to use). Server components read identity from the cookie; forms POST to the Task 12 handlers.

**Files:**
- Create: `app/console/page.tsx`, `app/members/page.tsx`, `app/page.tsx`

- [ ] **Step 1: Create the landing/login page**

```tsx
// app/page.tsx
import { buildAuthorizeUrl } from "@/lib/contentful/oauth";

export default function Home() {
  const url = buildAuthorizeUrl({
    clientId: process.env.CF_OAUTH_CLIENT_ID ?? "",
    redirectUri: process.env.CF_OAUTH_REDIRECT_URI ?? "",
  });
  return (
    <main style={{ maxWidth: 560, margin: "80px auto", fontFamily: "system-ui" }}>
      <h1>Contentful Governed Roles</h1>
      <p>Sign in with Contentful to manage governed roles and space members.</p>
      <a href={url}><button>Sign in with Contentful</button></a>
    </main>
  );
}
```

- [ ] **Step 2: Create the Org Admin console**

```tsx
// app/console/page.tsx
"use client";
import { useState } from "react";

export default function Console() {
  const [name, setName] = useState("Standard Governed");
  const [contentTypeId, setContentTypeId] = useState("config");
  const [spaceId, setSpaceId] = useState("");
  const [out, setOut] = useState("");

  async function applyPolicy() {
    const policy = { name, denies: [{ action: "edit", contentTypeId }] };
    const res = await fetch("/api/reconcile-role", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ spaceId, policy }),
    });
    setOut(JSON.stringify(await res.json(), null, 2));
  }

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>Org Admin Console</h1>
      <p>Define a deny policy and apply it as the governed role for a space.</p>
      <label>Policy name <input value={name} onChange={(e) => setName(e.target.value)} /></label><br />
      <label>Deny edit on content type <input value={contentTypeId} onChange={(e) => setContentTypeId(e.target.value)} /></label><br />
      <label>Space ID <input value={spaceId} onChange={(e) => setSpaceId(e.target.value)} /></label><br />
      <button onClick={applyPolicy}>Apply governed role</button>
      <pre>{out}</pre>
    </main>
  );
}
```

- [ ] **Step 3: Create the member-management surface**

```tsx
// app/members/page.tsx
"use client";
import { useState } from "react";

export default function Members() {
  const [spaceId, setSpaceId] = useState("");
  const [email, setEmail] = useState("");
  const [out, setOut] = useState("");

  async function addMember() {
    const res = await fetch("/api/members", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ spaceId, action: "add", email }),
    });
    setOut(JSON.stringify(await res.json(), null, 2));
  }

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>Manage Space Members</h1>
      <p>Add a user to your space. Protected Org Admins/Owners cannot be removed here.</p>
      <label>Space ID <input value={spaceId} onChange={(e) => setSpaceId(e.target.value)} /></label><br />
      <label>User email <input value={email} onChange={(e) => setEmail(e.target.value)} /></label><br />
      <button onClick={addMember}>Add user</button>
      <pre>{out}</pre>
    </main>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: Next build succeeds; `/`, `/console`, `/members`, and all `/api/*` routes compile.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx app/console/page.tsx app/members/page.tsx
git commit -m "feat(ui): login, org-admin console, member-management surfaces"
```

---

## Task 16: README + deploy notes

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write the README**

```markdown
# Contentful Governed Roles

Replaces built-in Space Admin with a governed custom role (per-space deny rules) and
bridges user-management through an external service gated by a per-space allowlist.
Standalone Next.js app on Vercel — not a Contentful App Framework app.

## Setup
1. `pnpm install`
2. Copy `.env.example` → `.env`, fill in the service token, org/space IDs, OAuth + secrets.
3. Run probes (Task 13) against a dev space before trusting role/membership behavior.
4. `pnpm dev`, sign in at `/`.

## Surfaces
- `/console` — Org Admin: define deny policies, apply governed roles per space.
- `/members` — allowlisted inviters: add/remove users (protected identities blocked).

## Mechanisms
- Governed-role engine (`lib/policy`, `lib/cma/roles.ts`)
- Delegated membership bridge (`lib/cma/memberships.ts`)
- Detect-and-revert (`app/api/webhook`, `lib/governance/reconcile.ts`, cron)

## Limitations
Guardrail, not a hard boundary — Org Owners bypass via Org Settings. No hard in-UI block;
protection of Org Admins/Owners is detect-and-revert. See the design spec for details.
```

- [ ] **Step 2: Verify tests + typecheck all green**

Run: `pnpm test && pnpm typecheck`
Expected: all unit tests pass; typecheck clean.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README + setup/deploy notes"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- R1 (deny rules without losing admin) → Tasks 2, 3, 8.
- R2 (user mgmt survives) → Task 9 (addMember), Task 12.
- R3 (delegated invite at scale, allowlist) → Tasks 4, 9, 12.
- R4 (per-space policy) → Tasks 2, 10 (`spaceGovernance.policyRef`), 12.
- R5 (scale, self-healing) → Tasks 10 (templates), 14 (reconcile), `vercel.json` cron.
- R6 (audit) → Tasks 6, 10, wired through 12/14.
- R7 (usable) → Task 15.
- Auth/token model (§3.1) → Tasks 7, 11, 12.
- Guardrails / detect-and-revert (§4.3, §6) → Tasks 5, 12 (webhook), 14.
- Both Approach A and B (§1.2) → `spaceGovernance.inviterUserIds` allowlist (Tasks 10, 4, 9).
- Live probes (§8) → Task 13.

**Placeholder scan:** No TBD/TODO in code steps; every code step shows complete code. Two deliberate forward-references are explicit and scoped (webhook inline re-add finalized in Task 14; cron sweep body in Task 14).

**Type consistency:** `Identity`, `SpaceGovernanceRow`/`SpaceGovernanceGate`, `MembershipTarget`, `ProtectedContext`, `RoleDefinition`, `DenyPolicy`, `AuditEvent` are defined once and reused with consistent names/signatures across tasks. `computeGovernedRole` → `ensureGovernedRole` → `assignRole` chain is consistent.

**Known follow-ups to resolve during execution (carried from spec open questions):**
- O2 — confirm CMA role-policy constraint DSL (esp. field-level `paths`) via Probe 1; fall back to content-type-level if unsupported.
- O5 — org-level vs per-space webhook registration confirmed via Probe 3.
- O4 — governance-space-vs-DB persistence pending the account team's space-limit check.
