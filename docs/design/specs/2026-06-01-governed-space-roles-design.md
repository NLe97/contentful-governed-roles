# Governed Space Roles + Delegated User Management — Design

- **Status:** Draft (design complete, pending user review before plan)
- **Customer:** Enterprise (anonymized)
- **Author:** Ben Le
- **Date:** 2026-06-01
- **Maps to:** Enterprise Governance initiative — **MVP 2 / Phase 2**
- **Repo:** `~/Desktop/contentful-governed-roles` (new, standalone)
- **Relationship to prior work:** Coexists with `~/Desktop/contentful-org-governance` (Phase 1: MVP 1 team auto-attach + the now-**rejected** blunt freeze). This project does **not** extend that app and does **not** reuse the App Framework. Phase 1's protected "Org Admins team" is a dependency we respect, not modify.

---

## 1. Context & the permission model we are working within

Contentful has **two independent permission axes**. Getting this distinction right is the foundation of the whole design.

| Axis | Scope | Controlled in | Governs | Role in this project |
|---|---|---|---|---|
| **Organization membership** — Owner / Admin / Member | The whole org | Organization Settings | Billing, SSO, creating/deleting spaces, org members, **teams** | The **governors**. They define policy. **Never regulated by this tool.** They can always bypass via Org Settings — hence "guardrail, not a hard boundary." |
| **Space roles** — Space Admin + custom roles | One space | Space → Settings → Users / Roles & Permissions | Everything *inside* a space: content, content model, settings, R&P, **space membership** | The **regulation target.** |

**The Space Admin space role** is the problem child: it is all-or-nothing within a space, and it is the **only space role that can add/remove users to the space**.

The hard platform constraint that defines this MVP:

| Space role type | Can add users to space | Supports deny rules |
|---|---|---|
| Built-in Space Admin | ✅ | ❌ |
| Custom space role | ❌ | ✅ |

There is no native role that does both. Bridging that is the core technical work.

### 1.1 What the customer actually needs (captured requirements)

From the revised MVP 2 proposal:

- **R1 — Deny rules without losing admin function.** Space Admins keep functioning as admins but with *specific* content operations restricted via **configurable deny rules** (e.g. cannot modify JSON content types, cannot publish certain content types). Not all-or-nothing.
- **R2 — User management must survive.** The ability to add/remove users from a space **cannot be taken away** as part of any solution.
- **R3 — Delegated user-add at scale.** Designated individuals *per space* must be able to add users **without** being full Space or Org Admins. Org Admins are not full-time and **cannot be the bottleneck** across 80+ spaces.
- **R4 — Per-space policy.** Deny rules are configurable **per space** by Org Admins, not a global blanket.
- **R5 — Scale.** Must work across all 80+ spaces **without constant Org Admin intervention**.
- **R6 — Auditability.** All role and permission changes logged for traceability.
- **R7 — Easy to use.** A cosmetic workaround that doesn't solve the real pain will be rejected (a priority delivery blocker).

### 1.2 The two proposed approaches — and why we don't have to choose

The proposal names two acceptable paths, with the A-vs-B feasibility call reserved for the product feasibility session:

- **Approach A** — layer deny rules onto a Space-Admin-equivalent role (Space Admins keep inviting users themselves).
- **Approach B** — decouple "add user" into a separate *inviter* capability granted to designated individuals; Space Admins become a custom role with deny rules.

**Design insight that unblocks this:** A and B are the *same machine wired differently*. Both require one capability — *an external service that performs "add/remove user to a space" on behalf of someone who lacks the native permission, using a higher-privilege service token, gated by a per-space allowlist of who is authorized.* The only difference is **who is on that allowlist**:

| | Space Admins' role | Allowlist of "who can invite users" |
|---|---|---|
| **Approach A** | Governed custom role (Space-Admin-equivalent minus deny rules) | the governed Space Admins themselves |
| **Approach B** | Governed custom role (with deny rules) | separate designated inviters (need not be admins) |

So we build **one mechanism** and make "who can invite in space X" a per-space config value. **A vs B becomes a data choice, not an architecture choice** — selectable per space, reversible by editing a list. This de-risks the open product question and is the simplest thing to operate.

## 2. Goals / non-goals

**Goals**
- Replace built-in Space Admin (where the customer opts in) with a **governed custom space role** carrying per-space deny rules (R1, R4).
- Preserve add/remove-user capability via a **delegated membership service**, gated per space (R2, R3).
- Support **both** Approach A and B through per-space allowlist config (no rebuild to switch).
- Scale to 80+ spaces via **policy templates + assignment + wave rollout**, no per-space hand-coding (R5).
- Full **audit log** of role/membership/policy changes (R6).
- A genuinely usable two-surface web app: an Org-Admin policy console and a dead-simple member-management screen (R7).
- Honest about the guardrail limit (Org Owners bypass via Org Settings).

**Non-goals (YAGNI)**
- Regulating org-level roles (Owner/Admin) — explicitly out of scope; they are the governors.
- A Contentful App Framework iframe app — this is a standalone web app, hosted externally.
- Reusing or modifying the Phase 1 app or its blunt freeze (rejected by the customer).
- True in-UI interception/blocking of native Contentful actions (not possible — see §6).
- Marketplace listing.
- A native deny-rule engine on the built-in Space Admin role (that's a product ask, tracked as an open question).

## 3. Architecture overview

A standalone **Next.js (App Router) app on Vercel**. Two UI surfaces, a small set of server actions / route handlers, a privileged service token for CMA writes, and webhooks for drift defense.

```
   ┌──────────────────────── Browser (Contentful OAuth login) ─────────────────────┐
   │                                                                                │
   │   Org Admin console                         Member management surface          │
   │   • define deny-rule policies (templates)   • add / remove users in space X    │
   │   • assign policy → space(s)                • (visible to that space's         │
   │   • set per-space inviter allowlist           allowlisted inviters/admins)     │
   │   • view audit log                                                             │
   └───────────────┬─────────────────────────────────────────┬──────────────────────┘
                   │ authenticated app requests               │
                   ▼                                          ▼
        ┌───────────────────────────────────────────────────────────┐
        │  Vercel — Next.js route handlers / server actions          │
        │   • POST /api/policies            (define / assign policy)  │
        │   • POST /api/reconcile-role      (sync governed role)      │
        │   • POST /api/members             (add / remove user)       │
        │   • POST /api/webhook             (detect-and-revert)       │
        │   • GET  /api/cron/reconcile      (drift sweep)             │
        │      authorization: Contentful OAuth identity + per-space   │
        │      allowlist check                                        │
        │      privileged writes: SERVICE org token                  │
        └───────────────────────┬───────────────────────────────────┘
                                 │ CMA (service token)
                                 ▼
                 ┌───────────────────────────────────────┐
                 │ Contentful org (the customer)                 │
                 │  • governed custom role per space      │
                 │  • space memberships                   │
                 │  • governance space: policies, audit,  │
                 │    allowlists (content entries)        │
                 └───────────────────────────────────────┘
```

### 3.1 Authentication & token model

This is the central architectural decision forced by "standalone app, not App Framework."

- **Identity / login:** **Contentful OAuth**. Users sign in with their Contentful account so we can verify *who they are* and *what they're allowed to do* (Org Admin? on space X's inviter allowlist?). We never rely on the user's own token for the privileged write — a governed Space Admin's token **cannot** add users; that's the whole gap.
- **Privileged writes:** a **service-level org token** held server-side (a PAT for dev; a secured/rotated token, ideally a dedicated service identity, for prod). This token performs role creation, role assignment, and membership add/remove — the operations the user's own role can't.
- **Authorization gate:** every privileged action checks the OAuth identity against the relevant **per-space allowlist** (or Org-Admin status) before the service token is used. The service token is powerful; the gate in front of it is the security control.

### 3.2 Persistence

Reuse the Phase 1 pattern for consistency and to avoid contract-space concerns being worse: store config and audit as **Contentful entries in a dedicated governance space** (no external DB). Content types in §5. (Open item O4: confirm with the account team whether a governance space counts against the customer's contract space limit; fall back to a Marketplace DB if it's a problem.)

## 4. The three mechanisms

### 4.1 Governed-role engine (R1, R4)

For each space the customer opts in:

1. Read the space's assigned **deny policy** (§5.2).
2. Compute the **governed custom role** = a Space-Admin-equivalent capability set **minus** the policy's denies. "Space-Admin-equivalent" = the broadest custom-role capability set Contentful allows (full content + content-model + settings management), excluding the things custom roles inherently can't grant (notably manage-memberships — bridged in §4.2).
3. Create or update that role in the space via CMA; cache its role ID.
4. **Migrate** the space's human Space Admins from built-in Space Admin → the governed role (recording the original role for reversibility).
5. On policy change, recompute and PATCH the role; assignments don't need to change (same role, new rules).
6. A scheduled reconcile re-asserts the role definition to repair drift (someone editing it natively).

Deny-rule examples in scope per the proposal: deny *edit* on specific content types (e.g. JSON content types), deny *publish* on specific content types, optionally field-level denies where Contentful's role policy language supports it.

### 4.2 Delegated membership service — the bridge (R2, R3)

The capability both A and B need.

- The **member management surface** lists a space's members and offers add/remove to whoever is on that space's **inviter allowlist** (governed Space Admins under A; designated inviters under B — config, §5.3).
- On submit, the backend verifies the caller is on the allowlist for that space, then performs the add/remove using the **service token**.
- **Guardrails enforced here (a true block, because we own this UI):**
  - Cannot remove the **MVP 1 protected Org Admins team**.
  - Cannot remove any **Org Admin / Owner** identity (team-sourced or individual space membership).
  - Cannot grant built-in Space Admin (would re-open the gap); new users get an appropriate space role.
- Every action appends an audit event.

### 4.3 Drift defense — detect-and-revert (guardrail for native-UI bypass)

We cannot intercept a click in Contentful's native members screen (§6). So:

- Webhooks on `SpaceMembership.delete` and `TeamSpaceMembership.delete`. If the removed identity is a protected Org Admin/Owner or the protected team, the backend **re-adds within seconds** and audits `PROTECTED_REMOVAL_REVERTED`.
- A scheduled **reconcile sweep** (cron) re-asserts governed-role definitions and protected-membership presence across opted-in spaces, catching anything a missed webhook left behind.

## 5. Content model (governance space)

### 5.1 `governanceSettings` (singleton)
| Field | Type | Notes |
|---|---|---|
| `orgId` | Symbol | Target org |
| `protectedTeamId` | Symbol | MVP 1 Org Admins team (do-not-remove) |
| `serviceTokenRef` | Symbol | Reference/label only; the secret lives in Vercel env |
| `enforcementEnabled` | Boolean | Global kill switch |

### 5.2 `denyPolicy` (reusable template; N)
| Field | Type | Notes |
|---|---|---|
| `name` | Symbol | e.g. "Event Lockdown", "Standard Governed" |
| `denies` | Object | Structured rules: `[{ action: "edit"\|"publish"\|..., contentTypeId, fields?: string[] }]` |
| `description` | Text | Human summary |

Templates make 81-space config tractable: define a few policies, assign by reference.

### 5.3 `spaceGovernance` (one per opted-in space)
| Field | Type | Notes |
|---|---|---|
| `spaceId` | Symbol | App-level key (filter on read; upsert on write) |
| `spaceName` | Symbol | Cached label |
| `policyRef` | Link/Symbol | Which `denyPolicy` applies |
| `inviterUserIds` | Object | Allowlist for the membership bridge (the A-vs-B knob) |
| `governedRoleId` | Symbol | Cached custom-role ID |
| `mode` | Symbol enum | `APPROACH_A` \| `APPROACH_B` (derived/explicit, for clarity) |
| `rolloutStatus` | Symbol enum | `PENDING` \| `ROLE_CREATED` \| `MIGRATED` \| `ACTIVE` |
| `lastReconciledAt` | Date | |

### 5.4 `auditEvent` (append-only; N)
| Field | Type | Notes |
|---|---|---|
| `eventType` | Symbol enum | `POLICY_DEFINED` · `POLICY_ASSIGNED` · `ROLE_CREATED` · `ROLE_UPDATED` · `ADMIN_MIGRATED` · `MEMBER_ADDED` · `MEMBER_REMOVED` · `PROTECTED_REMOVAL_REVERTED` · `RECONCILE_RUN` · `ERROR` |
| `spaceId` | Symbol | Optional |
| `actorUserId` | Symbol | OAuth identity, or `"system"` |
| `details` | Object | Event-specific |
| `timestamp` | Date | |

## 6. Honest limitations (set expectations with the customer)

- **No hard in-UI block.** Neither the App Framework nor the CMA can intercept/cancel a native UI action. Protection of Org Admins/Owners is **detect-and-revert** (re-add within seconds), plus a true block inside *our* dashboard. This matches the proposal's "guardrail, not a hard boundary."
- **Org Owners bypass everything** via Org Settings — by design.
- **The service token is the trust anchor.** Its capability is what makes the bridge possible; the per-space allowlist gate is the compensating control. Token must be secured and rotated.
- **"Space-Admin-equivalent" ≈, not =.** The governed custom role matches Space Admin's *content/settings* powers as closely as Contentful's custom-role capability set allows; manage-memberships is bridged externally rather than granted in-role.

## 7. Scale & rollout (R5)

- **Templates + assignment**, not per-space authoring.
- **Wave rollout:** pilot 2–3 high-risk spaces → validate → roll the remaining spaces in waves keyed by template.
- **Self-healing:** cron reconcile + webhooks mean steady-state needs no Org Admin babysitting.

## 8. Testing strategy

- **Live probes first** (before product code), against the dev org:
  - P1: governed custom role can be created with the intended deny set; assigned user is blocked from the denied operation (e.g. editing a JSON content type) but retains other admin functions.
  - P2: service token can add/remove a space membership on behalf of a non-admin inviter.
  - P3: `SpaceMembership.delete` / `TeamSpaceMembership.delete` webhooks fire and re-add works.
- **Unit tests:** policy → role capability computation, allowlist authorization gate, audit shapes, OAuth/identity verification, guardrail refusals.
- **Integration tests** (gated): role create/assign round-trip; member add/remove with guardrail; detect-and-revert; reconcile drift repair.
- **Manual demo:** Org Admin defines policy → assigns to pilot space → Space Admin migrated → Space Admin blocked from JSON edit but can still invite a user → inviter (non-admin) adds a user → attempted removal of an Org Admin is reverted.

## 9. Open questions (for the product follow-up session)

| # | Question | Owner | Notes |
|---|---|---|---|
| O1 | Approach A vs B feasibility — does the governed custom role get close enough to Space Admin that A is acceptable, or is B (separate inviter) cleaner? | Eng + Product | Design supports both; this picks the default per space. |
| O2 | Exact deny-rule granularity the CMA role policy language supports — content-type-level vs field-level (esp. JSON fields). | Eng + Product | Verified by Probe P1. |
| O3 | Which specific content types / fields the customer wants to restrict initially. | Org Admins | JSON content types flagged as the example. |
| O4 | Does a dedicated governance space count against the customer's contract space limit? | Account team | If yes, fall back to a Marketplace DB for persistence. |
| O5 | Production service-identity strategy (dedicated service user vs PAT vs OAuth-app token) and rotation policy. | Ben | Dev uses a PAT; prod must be hardened. |
| O6 | multi-space rollout sequencing — wave definition and ownership. | Eng + Customer | Pilot 2–3 first. |

## 10. References

- Enterprise Governance initiative — MVP 2 proposal (revised June 2026).
- Phase 1 app: `~/Desktop/contentful-org-governance` (MVP 1 + rejected freeze) — protected team is a dependency.
- Dev org used in Phase 1: a small internal dev org.
