# Install & Deploy Guide

How to deploy this governance app to Vercel for an organization, end to end. Plan ~30 minutes.

## What you're deploying

A standalone Next.js app (not a Contentful App Framework app). It exposes:

| Surface | Audience | Auth |
|---|---|---|
| `/` → `/console` | **Governance Console** — persona-aware: **Org Admins** see all spaces + MVP1 (team auto-attach) + MVP2 (governed roles, members, bulk) + admin/inviter list management + **Seed Space Admins** button; **Space Admins** see only their own space(s) (role manager + members); **Inviters** see add-user only | Contentful OAuth login |
| `/members` | Allow-listed inviters — add users to a space (the delegated bridge) | Contentful OAuth login |
| `/api/cron/reconcile` | Vercel Cron — drift sweep | `CRON_SECRET` |
| `/api/webhook` | Contentful webhooks — detect protected-identity removals | HMAC (`CF_WEBHOOK_SECRET`) |

> **Security boundary:** the privileged Contentful writes are performed by a **service token** held in server env. Every user-facing action is gated by **Contentful OAuth identity** (the console requires Org Admin/Owner; `/members` requires being on a space's inviter allowlist). After sign-in users land on the console at `/console`. (Locally, you can authenticate by setting the `cf_user_token` cookie to an org-admin PAT.)

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

## Step 5 — Seed Space Admins (first deploy only)

After the first deploy, have an **Org Admin** sign in and open `/console`. At the top of the console, click **"Seed Space Admins (all spaces)"**. This reads every space's current built-in Space Admins from Contentful and populates each space's admin list in the governance app, so existing space admins immediately receive delegated MVP 2 access without any manual data entry. The operation is **idempotent** — re-running it adds any new space admins and is safe to repeat.

## Step 6 — Set environment variables in Vercel (if not already set)

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
| `SCALE_ADMIN_EMAIL` | ❌ | dev/scale-test only (provisioning script) |

> `ENABLE_DEMO` is no longer used — the console is gated by Contentful OAuth + Org-Admin, so it's safe in production without any flag.

Redeploy after setting variables.

## Step 7 — Register the protection webhook (recommended)

In Contentful → **Organization/space settings → Webhooks → Add**:
- **URL:** `https://<your-vercel-domain>/api/webhook`
- **Triggers:** `SpaceMembership` *delete* and `TeamSpaceMembership` *delete*
- **Secret/HMAC:** set to the same value as `CF_WEBHOOK_SECRET`.

This lets the app detect when a protected Org Admin/Owner or the protected team is removed from a space.

## Step 8 — Verify

1. Visit `https://<your-vercel-domain>/` → **Sign in with Contentful** → you should land on the console at `/console`.
2. In the console, toggle a governed role on a pilot space; confirm a `Space Admin (Governed)` role appears in that space and non-protected admins are migrated.
3. Add a user via the console (or `/members`); confirm the membership appears in Contentful.
4. Confirm a **non-Org-Admin** signing in gets `403 org admin required` from the console endpoints.
5. Check the governance space → `auditEvent` entries are being written.

---

## Security & operating notes

- **Guardrail, not a hard boundary.** Org Owners/Admins can always bypass via Org Settings — by design. Protection of identities is detect-and-revert, not an in-UI block.
- **Rotate** `CF_SERVICE_TOKEN` on a schedule and after the pilot. The OAuth `cf_user_token` cookie is set client-side (implicit flow) — serve only over HTTPS.
- **Three personas** are supported by the console, all authenticated via the same **Contentful OAuth** flow:
  1. **Org Admin / Owner** — full console: all spaces, team auto-attach, governed-role toggles, admin/inviter list management, and the Seed button.
  2. **Space Admin** — an org **Member** who has been seeded (or manually added) as a space admin in the governance app. They sign in exactly the same way (Contentful OAuth) but **see and manage only their own space(s)**: role manager + member management. They are blocked with 403 on any other space. Their org membership stays **Member** — no org-level privilege is granted.
  3. **Inviter** — an org Member on a space's inviter allowlist. They can only reach the add-user (`/members`) surface for that space.

## Known limitations (MVP) / hardening roadmap

These are the items to harden before broad rollout:
- The console’s member add/remove is Org-Admin scoped; the per-space **inviter allowlist** (Approach B delegation) is enforced on `/members` but not yet surfaced in the console UI.
- `/api/webhook` currently **logs** protected-removal detections; automatic re-add and the cron drift-sweep body are stubbed (`planReconcile` exists/tested but unwired).
- Deny-policy persistence + per-space assignment is audit-only so far (the console applies governed roles directly).
- The older per-surface API routes (`/api/policies`, `/api/reconcile-role`) are superseded by the console's `/api/console/*` and can be retired.
