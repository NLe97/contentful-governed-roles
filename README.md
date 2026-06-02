# Contentful Governed Roles

Replaces built-in Space Admin with a governed custom role (per-space deny rules) and
bridges user-management through an external service gated by a per-space allowlist.
Standalone Next.js app on Vercel — not a Contentful App Framework app.

## Setup
1. `npm install`
2. Copy `.env.example` → `.env`, fill in the service token, org/space IDs, OAuth + secrets.
3. Run probes (`scripts/probe-*.ts` via `npx tsx`) against a dev space before trusting role/membership behavior.
4. `npm run dev`, sign in at `/`.

## Surfaces
- `/console` — Org Admin: define deny policies, apply governed roles per space.
- `/members` — allowlisted inviters: add/remove users (protected identities blocked).

## Mechanisms
- Governed-role engine (`lib/policy`, `lib/cma/roles.ts`)
- Delegated membership bridge (`lib/cma/memberships.ts`)
- Detect-and-revert (`app/api/webhook`, `lib/governance/reconcile.ts`, cron)

## Limitations
Guardrail, not a hard boundary — Org Owners bypass via Org Settings. No hard in-UI block;
protection of Org Admins/Owners is detect-and-revert. See the design spec in
`docs/design/specs/` for details.
