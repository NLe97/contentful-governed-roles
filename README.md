# Contentful Governance Console

A standalone governance layer for a Contentful **organization**. It lets an Org Admin keep
control of every space — without handing out full Space Admin — by replacing built-in Space Admin
with **governed custom roles** (per-space content deny rules) and by delegating day-to-day user
management through a gated service bridge.

It is a self-contained **Next.js app deployed on Vercel** — *not* a Contentful App Framework app.
It is **single-tenant per deployment** and **fully env-driven**: nothing about any organization is
hardcoded, so the same source ships to any org and is configured entirely through environment
variables. There is **no external database** — all governance data (policies, per-space config, audit
log) lives as entries in one dedicated **governance space** in Contentful.

---

## Why it exists

In Contentful, "Space Admin" is all-or-nothing: anyone who can manage a space's members and content
can also do anything else in that space. Organizations that want to delegate *some* control — "let
this team manage their own space, but never let them edit the legal content type, and never let them
remove an Org Admin" — have no built-in way to express that. This app fills that gap:

- **Org Admins stay in control of every space** without manually re-attaching themselves.
- **Space teams get self-service** for roles and membership, scoped to their own space only.
- **Sensitive content stays protected** via deny rules baked into a custom role.
- **Org Admins/Owners can't be locked out** — their removal is detected and reverted.

---

## The two capabilities

### Org Admin Coverage *(formerly "MVP 1")*
Keeps a protected **Org Admins team** attached as Admin across **every** space, and lets you
fan-out-attach it to all spaces at once. Space Admins can't permanently remove it — if they do, the
detect-and-revert loop (webhook + daily cron) restores it.

### Space Role Governance *(formerly "MVP 2")*
Per space, you can **toggle a governed role**: a custom role with full admin powers *minus* a chosen
deny rule (e.g. "deny `edit` on `legalDoc`"). Non-protected Space Admins are migrated onto it, so the
deny actually binds. You can also create additional **deny-ruled roles**, assign members to them, and
**add/remove users** through a delegated service-token bridge — all without granting anyone org-level
privilege. A bulk apply/remove makes it work across all spaces at once.

Both capabilities **never** re-role or remove an **Org Admin or Owner**; that protected set is derived
server-side from the org's live admin/owner list and is never trusted from the client.

---

## Personas

The console is **persona-aware** — it detects the caller's governance role on sign-in and shows only
what they're allowed to do:

| Persona | Sees | Can do |
|---|---|---|
| **Org Admin** | Everything | Setup & Health, Org Admin Coverage, Space Role Governance, admin/inviter lists, import space admins |
| **Space Admin** | Only their own space(s) | Manage roles + members within those spaces |
| **Inviter** | Add-user only | Invite users into spaces they're allowlisted for |

Persona is resolved per request (`lib/console/persona.ts`, `lib/auth/space-access.ts`); every
`/api/console/*` endpoint enforces it server-side (401/403), independent of the UI.

---

## First-run setup (Setup & Health screen)

Because it's self-deploy, the first thing an Org Admin sees in `/console` is a **Setup & Health** card
that checks the deployment is wired up correctly — without ever exposing secret values:

- ✅/❌ per required environment variable (presence only).
- **Org reachable** — a live CMA call with the service token succeeds.
- **Governance content model ready** — the `denyPolicy` / `spaceGovernance` / `auditEvent` content
  types exist in the governance space.

If anything is missing or failing, the banner names the exact remediation (which env var to set, or to
run the bootstrap script). When all green, it shows "All systems go." Backed by a pure, unit-tested
`summarizeHealth` helper (`lib/console/health.ts`) and the `GET /api/console/health` endpoint.

---

## Quick start (local)

```bash
npm install
cp .env.example .env          # fill the service token, org/space IDs, OAuth client + secrets
npx tsx scripts/bootstrap.ts  # provision the governance content model (idempotent)
npm run dev                   # then sign in at http://localhost:3000/
```

> Use **Node 20** (`nvm use`). For a full production deploy to Vercel — OAuth app, env vars in the
> dashboard, the protection webhook, and importing existing space admins — follow **`INSTALL.md`**
> end to end (~30 min). `DEMO.md` walks through proving the behavior.

Before trusting role/membership behavior against a real org, run the probe scripts against a dev
space: `npx tsx scripts/probe-1-role-deny.ts` (and `probe-2`, `probe-3`).

---

## Surfaces

| Route | Audience | Auth |
|---|---|---|
| `/` | Sign-in landing | — |
| `/console` | Persona-aware governance console | Contentful OAuth (org-admin for full view) |
| `/members` | Allowlisted inviters — add users to a space | Contentful OAuth |
| `/api/console/*` | Console backend (`me`, `health`, `mvp1`, `mvp2`, `roles`, `admins`) | Org-Admin / per-space session |
| `/api/webhook` | Contentful webhooks — detect protected-identity removals | HMAC (`CF_WEBHOOK_SECRET`) |
| `/api/cron/reconcile` | Vercel Cron — daily drift sweep | `CRON_SECRET` |

---

## How it's built

- **Framework:** Next.js 15 (App Router), React 18, TypeScript, deployed on Vercel.
- **State store:** Contentful itself — the governance space holds `denyPolicy`, `spaceGovernance`, and
  `auditEvent` entries (`lib/governance/store.ts`, `lib/governance/content-model.ts`). No DB.
- **Governed-role engine:** `lib/policy`, `lib/cma/` (Contentful Management API REST client + roles).
- **Delegated membership bridge:** privileged CMA writes via the service token, gated by per-space
  allowlists (`lib/auth/space-access.ts`).
- **Protected identities:** `lib/governance/protected-set.ts` derives the do-not-touch Org
  Admins/Owners set server-side.
- **Detect-and-revert:** `app/api/webhook` + `lib/governance/reconcile.ts`, swept daily by the cron.
- **Audit log:** `lib/audit` writes `auditEvent` entries for governance actions.
- **Tests:** Vitest (`npm test`); the health summary and policy logic are unit-tested.

---

## Limitations

This is a **governance layer, not a hard security boundary.** Org **Owners** can always bypass it via
org settings, and protection of Org Admins/Owners is **detect-and-revert** (a brief window exists
between an unauthorized change and the sweep that undoes it), not an in-UI hard block. The deny rules
themselves *are* enforced by Contentful once applied. See the design specs in `docs/design/specs/` for
the full threat model and hardening roadmap.
