# Delegated Per-Space Governance (MVP 2, reframed) — Design

- **Status:** Draft (design approved verbally; pending written-spec review)
- **Date:** 2026-06-03
- **Builds on:** `2026-06-01-governed-space-roles-design.md` (the MVP 2 base: governed-role engine,
  service-token bridge, protected-identity guardrail, console). This spec **reframes and extends**
  MVP 2 with delegated, per-space, per-user governance.

---

## 1. Why this change

The base MVP 2 applied **one** governed role per space, controlled only by Org Admins. Two gaps:

1. **Per-user granularity.** Different people in the same space need different restrictions
   (Alice can't publish `landingPage`; Bob can't edit JSON `config`). One role per space can't do that.
2. **Delegation.** Org Admins (Santiago, Julien — *org owners of the customer org*) cannot be the
   bottleneck for 80+ spaces. **Space Admins must govern their own space themselves.**

**Reframe:** MVP 2 becomes a **delegated front-end over each space's real Contentful custom roles.**
Each space has its own deny-ruled custom roles (exactly like native Contentful R&P); Space Admins
manage *their* space's roles and assignments through the app (service-token bridge), scoped and
guardrailed. Per-user granularity falls out naturally: different people → different deny-ruled roles.

## 2. The two Contentful permission layers (the basis for auth)

| Layer | Who | In this app |
|---|---|---|
| **Organization** membership (Owner / Admin / **Member**) | org-level | Org Admin/Owner = full access, all spaces |
| **Space** roles (built-in Space Admin + custom roles) | per space | A **Space Admin** is an org *Member* who is a Space Admin in specific space(s) → app access to **MVP 2 for those spaces only** |

A Space Admin is **not** an org admin — at the org level they are only a Member. So authorization
keys off *space* membership for Space Admins and *org* membership for Org Admins.

### 2.1 Verified constraint (2026-06-03)

A custom role's entire permission vocabulary is `ContentModel, Settings, ContentDelivery,
Environments, EnvironmentAliases, Tags` — **there is no permission for managing space users/
memberships.** Inviting/removing users is controlled solely by the membership `admin` flag
(built-in Space Admin). Confirmed live against the org's custom roles.

### 2.2 The Space Admin model — built-in super admin ↔ governed role

- **Built-in Space Admin = the space's "super admin."** Full native powers, **including inviting
  users** and managing roles. This role is **retained** — we never strip it as the way to govern.
- **To enforce deny rules on a space admin, shift them into a governed role**: a custom role with
  all space permissions *minus* user-invite (the inherent constraint) *plus* the deny rules. Their
  lost invite ability is **restored through the app's service-token bridge**.
- So governing is reversible role movement: built-in Space Admin ⇄ governed custom role. Per-user
  granularity = different governed roles with different denies. Org Admins or a space's super admin
  decide who gets governed and how.

## 3. Personas & access model

| Persona | How identified | Can do |
|---|---|---|
| **Org Admin / Owner** | org membership role = `admin` or `owner` | Everything, all spaces (MVP 1 + MVP 2); manages each space's admin/inviter lists |
| **Space Admin** | in space X's **admin list** (hybrid: seeded from current built-in Space Admins, editable by Org Admins) **or** currently a built-in Space Admin of X | MVP 2 for space X only: create/edit deny-ruled custom roles, assign members to roles (incl. other Space Admins of X), add/remove users |
| **Inviter** | in space X's **inviter list** | Add users to space X only — no admin status required (requirement 3) |

**Requirements satisfied:**
- *Space Admins retain add/remove users* → the bridge, available to Space Admins for their spaces.
- *Specific content ops restricted via configurable deny rules without losing other admin powers* →
  deny-ruled custom roles (e.g. cannot publish `landingPage`, cannot edit JSON `config`).
- *Designated individuals can add users without full admin* → the per-space inviter list.
- *Space Admins can restrict other Space Admins* → assigning a peer to a deny-ruled role.

## 4. Authorization model

Two new server-side gates (alongside the existing `authorizeOrgAdmin`):

- `authorizeSpaceAccess(req, spaceId)` → allow if **Org Admin/Owner**, OR caller ∈ `adminUserIds(spaceId)`,
  OR caller is currently a built-in Space Admin of `spaceId`. Used for all per-space MVP 2 operations.
- `authorizeInviter(req, spaceId)` → allow if space-access (above) OR caller ∈ `inviterUserIds(spaceId)`.
  Used only for add-user.

- **Org-wide operations** (MVP 1 team auto-attach, bulk apply, editing admin/inviter lists) remain
  **Org Admin/Owner only** (`authorizeOrgAdmin`).
- Identity comes from the Contentful OAuth cookie (`resolveIdentity`); the privileged write is always
  performed by the service token after the gate passes.

## 5. Data model (governance space)

Extend the existing `spaceGovernance` entry (one per managed space):

| Field | Type | Notes |
|---|---|---|
| `spaceId` | Symbol | key |
| `spaceName` | Symbol | cached label |
| `adminUserIds` | Object (string[]) | **Space Admins** allowed to manage this space via the app (hybrid-seeded) |
| `inviterUserIds` | Object (string[]) | add-user-only delegates |
| `lastSeededAt` | Date | when the admin list was seeded from built-in admins |

**Deny rules themselves are NOT stored here** — they live in the space's real Contentful custom roles
(durable, native). The governance entry only holds *who may manage* the space and *who may invite*.

## 6. Capabilities / operations (per space, service-token-backed)

Generalize the current single-role engine into role CRUD + assignment:

- **List roles** — the space's custom roles + their deny policies (decoded from role `policies`).
- **Create / update role** — name + deny rules → `computeGovernedRole`-style definition (reuse the
  existing policy→role compute; allow arbitrary names, multiple per space).
- **Delete role** — with reassignment safety (reassign or block if members still hold it).
- **List members** — with each member's role(s), built-in-admin flag, and 🛡️ protected flag.
- **Assign member → role** — set a member to a deny-ruled custom role (this is how a Space Admin
  governs a user or a peer Space Admin: move them off built-in admin onto a deny-ruled role).
- **Add user** (bridge) / **Remove user** (guardrailed).

**Guardrails (enforced server-side):**
- Cannot remove or re-role an **Org Admin/Owner** (protected set derived server-side) or the MVP 1 team.
- **Built-in Space Admin (super admin) is legitimate and retained** — promoting/demoting between
  built-in Space Admin and governed roles is the *intended* mechanism, available to Org Admins and a
  space's super admins. We do **not** block granting built-in Space Admin.
- A **governed** Space Admin (one currently on a deny-ruled role) cannot use the app to lift their
  *own* governance or self-promote to built-in admin — only Org Admins or a built-in super admin of
  the space can move someone out of a governed role. (Prevents a restricted admin from escaping denies.)
- Org Admins/Owners can always override — guardrail, not a hard boundary.

## 7. Onboarding / setup (the "easy to set up" requirement)

A one-time **seed sweep** (Org-Admin-triggered, idempotent), per space:
1. Read the space's current built-in Space Admins.
2. Write them into `spaceGovernance.adminUserIds` (seed), set `lastSeededAt`.
3. Leave `inviterUserIds` empty (Org Admins add inviters later).

After seeding, the customer's existing Space Admins are automatically app Space Admins — **zero
per-space hand-config to start**. Org Admins refine admin/inviter lists from the console afterward.
Re-running the sweep is safe (merges, doesn't clobber manual edits).

## 8. UI — one console, persona-aware

`/console` adapts to the signed-in identity (resolved server-side):

- **Org Admin/Owner:** full console — MVP 1 (team attach, bulk), MVP 2 across all spaces, and
  **admin/inviter list management** per space, plus the **seed sweep** button.
- **Space Admin:** sees only the spaces they may manage; for each, the **role manager** (list/create/
  edit deny-ruled roles) + **members** (assign roles, add/remove users). No MVP 1, no bulk, no other spaces.
- **Inviter:** a minimal add-user view for their space(s) only.

The page requests `/api/console/me` first to learn the caller's persona + accessible spaces, then
renders the appropriate surface.

## 9. What we reuse vs. add

**Reuse:** `computeGovernedRole` (policy→role), the service-token REST client + retry + `pmap`,
`getProtectedUserIds`, the protected-removal guardrail, the OAuth identity + cookie flow, the bulk/
fan-out plumbing, the governance store pattern.

**Add:**
- `lib/auth/require-request.ts` → add `authorizeSpaceAccess`, `authorizeInviter` (+ a space-admin check).
- `lib/console/operations.ts` → role CRUD + assign-member + seed-sweep + per-space list resolution.
- `lib/governance/store.ts` → read/write `adminUserIds` / `inviterUserIds` / `lastSeededAt`.
- `app/api/console/me/route.ts` → persona + accessible-space resolution for the UI.
- `app/api/console/*` → per-space endpoints gated by `authorizeSpaceAccess` / `authorizeInviter`.
- `app/console/page.tsx` → persona-aware rendering.

## 10. Testing

- **Pure logic (unit):** space-admin/inviter gate decisions; role-policy compute for arbitrary names;
  protected/escalation guardrails (no built-in-admin grant, no org-admin re-role); seed-merge logic.
- **Live probes (service token):** create/edit/delete a custom role in a space; assign a member to it;
  confirm a non-org-admin space admin can manage their space but is **403 on another space**.
- **Manual:** sign in as an org member who is a Space Admin of one space → can govern that space, cannot
  see/touch others; org admin sees everything; inviter can only add users.

## 11. Open questions

| # | Question | Resolution |
|---|---|---|
| Q1 | Who counts as a Space Admin / can they invite + add fellow admins? | **Resolved:** mirror Contentful default — built-in Space Admins are recognized **live** by the app and can invite users + promote others natively (which auto-grants app access). The stored admin/inviter lists are Org-Admin-managed and seeded; Space Admins don't need to edit lists. |
| Q2 | Anti-escalation — can built-in Space Admin be granted? | **Resolved:** built-in Space Admin (super admin) is retained and grantable; only a *governed* admin self-lifting their own governance is blocked (§2.2, §6). |
| Q3 | Should deleting a role block until holders are reassigned? | Block + prompt (safer). |
| Q4 | Do we cap deny-ruled custom roles per space (Contentful role limits vary by plan)? | Surface the CMA error; document plan limits. |
