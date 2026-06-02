# Install & Deploy Guide

How to deploy this governance app to Vercel for an organization, end to end. Plan ~30 minutes.

## What you're deploying

A standalone Next.js app (not a Contentful App Framework app). It exposes:

| Surface | Audience | Auth |
|---|---|---|
| `/` → `/console` | Org Admins — define deny policies, apply governed roles per space | Contentful OAuth login |
| `/members` | Allow-listed inviters — add users to a space (the delegated bridge) | Contentful OAuth login |
| `/api/cron/reconcile` | Vercel Cron — drift sweep | `CRON_SECRET` |
| `/api/webhook` | Contentful webhooks — detect protected-identity removals | HMAC (`CF_WEBHOOK_SECRET`) |
| `/demo` + `/api/demo/*` | **Dev only** — full console, **disabled in production** | none (gated by `ENABLE_DEMO`) |

> **Security boundary:** the privileged Contentful writes are performed by a **service token** held in server env. Every user-facing action is gated by Contentful OAuth identity + a per-space allowlist. **Never set `ENABLE_DEMO` in production** — those endpoints bypass that gate and exist only for local demos.

## Prerequisites

- Contentful **Org Admin/Owner** access to the target org.
- A **Vercel** account (and optionally the Vercel CLI: `npm i -g vercel`).
- Node 20+ locally (to run the one-time bootstrap script).

---

## Step 1 — Mint a service token

In Contentful → **Account settings → Tokens → Personal Access Tokens**, create a token held by an **Org Admin** (for a pilot). Treat it as a secret; plan to rotate it.

> Production hardening: prefer a **dedicated service-identity user** (not a person's PAT) so access survives staff changes and can be revoked independently.

## Step 2 — Pick/create the governance space and bootstrap it

This app stores deny policies, per-space config, and the audit log as entries in one **governance space** (no external DB). Choose an existing empty space or create a new one, then create its content model:

```bash
git clone https://github.com/NLe97/contentful-governed-roles.git
cd contentful-governed-roles && npm install
cp .env.example .env   # fill CF_SERVICE_TOKEN, CF_ORG_ID, CF_GOVERNANCE_SPACE_ID
npx tsx scripts/bootstrap.ts
```

`bootstrap.ts` is idempotent — it creates `denyPolicy`, `spaceGovernance`, and `auditEvent` content types (skips any that exist).

## Step 3 — Create a Contentful OAuth application (login)

In Contentful → **Organization settings → OAuth applications → Create**:
- **Redirect URI:** `https://<your-vercel-domain>/auth/callback` (must match exactly; you can add `http://localhost:3000/auth/callback` for local testing).
- Note the **Client ID**.

## Step 4 — Deploy to Vercel

Either import the GitHub repo at vercel.com (**New Project → Import**), or:

```bash
npm i -g vercel
vercel            # link/create the project
vercel deploy --prod
```

`vercel.json` already declares the daily cron (`/api/cron/reconcile`).

## Step 5 — Set environment variables in Vercel

Project → **Settings → Environment Variables** (Production):

| Variable | Required | Value |
|---|---|---|
| `CF_SERVICE_TOKEN` | ✅ | the Step 1 token |
| `CF_ORG_ID` | ✅ | target organization ID |
| `CF_GOVERNANCE_SPACE_ID` | ✅ | the Step 2 space ID |
| `CF_GOVERNANCE_ENVIRONMENT_ID` | — | defaults to `master` |
| `CF_PROTECTED_TEAM_ID` | ✅ | the "Org Admins" team to protect |
| `CF_OAUTH_CLIENT_ID` | ✅ | the Step 3 Client ID |
| `CF_OAUTH_REDIRECT_URI` | ✅ | `https://<your-vercel-domain>/auth/callback` |
| `CF_WEBHOOK_SECRET` | ✅ (for webhook) | a strong random string |
| `CRON_SECRET` | ✅ (for cron) | a strong random string (Vercel can generate one) |
| `ENABLE_DEMO` | ❌ **do not set** | leaving it unset disables the dev console |
| `SCALE_ADMIN_EMAIL` | ❌ | dev/scale-test only |

Redeploy after setting variables.

## Step 6 — Register the protection webhook (recommended)

In Contentful → **Organization/space settings → Webhooks → Add**:
- **URL:** `https://<your-vercel-domain>/api/webhook`
- **Triggers:** `SpaceMembership` *delete* and `TeamSpaceMembership` *delete*
- **Secret/HMAC:** set to the same value as `CF_WEBHOOK_SECRET`.

This lets the app detect when a protected Org Admin/Owner or the protected team is removed from a space.

## Step 7 — Verify

1. Visit `https://<your-vercel-domain>/` → **Sign in with Contentful** → you should land on `/console`.
2. As an Org Admin, apply a deny policy to a pilot space; confirm a `Space Admin (Governed)` role appears in that space.
3. On `/members`, add a test user to a space; confirm the membership appears in Contentful.
4. Confirm `/demo` is inert (its API calls return `403 demo disabled`) — that's expected in production.
5. Check the governance space → `auditEvent` entries are being written.

---

## Security & operating notes

- **Guardrail, not a hard boundary.** Org Owners/Admins can always bypass via Org Settings — by design. Protection of identities is detect-and-revert, not an in-UI block.
- **Rotate** `CF_SERVICE_TOKEN` on a schedule and after the pilot. The OAuth `cf_user_token` cookie is set client-side (implicit flow) — serve only over HTTPS.
- **Keep `ENABLE_DEMO` unset** in every deployed environment.

## Known limitations (MVP) / hardening roadmap

The deployable product surfaces are intentionally minimal; these are the items to harden before broad rollout:
- `/console` applies a single content-type deny; `/members` supports add (list/remove is API-level, no full UI yet).
- `/api/webhook` currently **logs** protected-removal detections; automatic re-add and the cron drift-sweep body are stubbed (`planReconcile` exists/tested but unwired).
- Deny-policy persistence + per-space assignment is audit-only so far.
- The full-featured operations console (bulk apply, space table, members with protection) currently lives in the **dev-only `/demo`** surface; bringing it behind the OAuth gate is the main path to production parity.
