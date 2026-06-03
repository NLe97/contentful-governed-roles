# Demo Guide

This walks through demonstrating the two things the built-in Space Admin role can't do:
**(1)** restrict specific content operations with deny rules, and **(2)** let a non-admin add
users to a space. Both are proved directly against a live org with the probe scripts.

## The gap (say this first)

Contentful has two permission axes:
- **Org** (Owner / Admin) — org settings; the governors.
- **Space** roles — Space Admin is all-or-nothing and is the *only* space role that can add users.

| Space role | Can add users | Supports deny rules |
|---|---|---|
| Built-in Space Admin | ✅ | ❌ |
| Custom role | ❌ | ✅ |

No native role does both. This tool bridges that: a **governed custom role** (deny rules) plus a
**service-token bridge** that performs add-user on behalf of an allow-listed person.

## Easiest demo — the Governance Console (`/console`)

A web console drives **both MVPs** live. It's gated by **Contentful OAuth + Org Admin/Owner**.

1. Set `CF_SERVICE_TOKEN`, `CF_ORG_ID`, `CF_PROTECTED_TEAM_ID` in `.env`.
2. `npm run dev`, open **http://localhost:3000/** → **Sign in with Contentful** (needs `CF_OAUTH_CLIENT_ID`).
   - *Local shortcut without OAuth:* set the cookie `cf_user_token` to an org-admin PAT, then open `/console`.
3. The console (`/console`) gives you:
- **Org Admin Coverage** — a table of every space showing whether the protected **Org Admins team** is
  attached as Admin, and an **"Attach team to ALL spaces"** button (idempotent fan-out).
- **Space Role Governance** — pick a space, **toggle the governed role ON/OFF** (ON creates the deny-ruled
  custom role and migrates non-protected Space Admins onto it; OFF restores built-in Admin and
  deletes the role), **bulk apply/remove across ALL spaces**, see **members** with org
  admins/owners flagged 🛡️ **protected** (Remove is refused for them), and **add a user** under
  a non-admin role (the delegated bridge).

> All `/api/console/*` endpoints require an Org-Admin session (401/403 otherwise) — safe to deploy.

### Delegated per-space governance

This shows how a regular org **Member** who happens to be a built-in Space Admin of one space gets governed self-service — without receiving any org-level privilege.

1. **Sign in as Org Admin** → you land on the full console. Click **"Seed Space Admins (all spaces)"** once. This reads each space's current built-in Space Admins and populates the governance app's admin lists — existing space admins instantly get delegated access. (Idempotent — safe to re-run.)

2. **Sign in as an org Member who is a built-in Space Admin of exactly one space.** They authenticate via the same Contentful OAuth flow. The console detects their governance role and shows only that space:
   - They can **create deny-ruled custom roles** for the space (e.g. block editing of a sensitive content type).
   - They can **assign members** to roles within the space, including other org members and peers.
   - They can **add or remove users** from the space via the delegated service-token bridge.
   - Any request to view or modify **a different space** returns **403 Forbidden** — the API enforces this server-side regardless of the UI.

3. **Guardrail is always on:** even from the Space Admin persona, the console and API refuse to re-role or remove an **Org Admin or Owner**. The protected-identity check is derived server-side from the org's current admin/owner list — it is never trusted from the client.

The CLI probes below are an alternative for proving the same mechanisms without the UI.

## Prerequisites

1. `npm install`
2. Fill `.env` (see `.env.example`). For the probes you only need `CF_SERVICE_TOKEN`
   (an org-admin-scoped PAT — dev only, rotate after) and `CF_ORG_ID`.
3. Use Node 20 (`nvm use`).

Pick a **demo space** that has at least one content type. Note its space ID and one content
type ID (e.g. `post`). You'll set these as `PROBE_*` env vars below.

---

## Part 1 — Deny rules actually enforce (Probe 1)

**Claim:** we can stop a Space Admin from editing a specific content type while leaving the rest
of their admin powers intact.

```bash
CF_SERVICE_TOKEN=$CF_SERVICE_TOKEN \
PROBE_SPACE_ID=<demo-space-id> \
PROBE_CONTENT_TYPE_ID=<content-type-id> \
npx tsx scripts/probe-1-role-deny.ts
```

It prints a created **role ID** (a "Governed" custom role: full content/settings powers, minus
`update` on the chosen content type).

**Show it live:**
1. In the Contentful web app → that space → **Settings → Users**, assign a test user to the new
   governed role.
2. Log in as that user (or use an incognito session). They can navigate and edit most content,
   **but editing/saving an entry of the denied content type is blocked**.
3. Contrast: they did **not** lose their other admin-style capabilities — this is surgical, not
   the old all-or-nothing freeze.

> Field-level note: the role can also deny specific fields (e.g. a JSON field) — see
> `computeGovernedRole` and spec open question O2. Verify field-level denies in your CMA before
> promising them.

---

## Part 2 — Delegated add-user without Space Admin (Probe 2)

**Claim:** someone who is *not* a Space Admin can still add a user to the space, because the
backend performs the write with the service token.

```bash
CF_SERVICE_TOKEN=$CF_SERVICE_TOKEN \
PROBE_SPACE_ID=<demo-space-id> \
PROBE_EMAIL=<test-user-email> \
PROBE_ROLE_ID=<a-non-admin-role-id-in-that-space> \
npx tsx scripts/probe-2-token-membership.ts
```

It prints a **membership ID**.

**Show it live:** in **Settings → Users**, the invited user now appears under the chosen
(non-admin) role — added without anyone holding Space Admin, and without granting Space Admin.

---

## Part 3 — The guardrail (protect org admins/owners)

**Claim:** governed admins can manage members but can never remove org admins/owners or the
protected team.

- The enforcement logic is unit-tested: run `npm test` and point at
  `tests/guardrails/protected.test.ts` and `tests/api/members-handler.test.ts` — a remove of a
  protected identity is refused (403) and the service token is never called.
- In the product, the protected set is derived **server-side** from the org's admin/owner
  memberships (never trusted from the client), and the protected team comes from
  `CF_PROTECTED_TEAM_ID`.
- Live "detect-and-revert" on removals made directly in the Contentful UI is wired to a webhook
  that currently **logs** the event (`PROTECTED_REMOVAL_DETECTED`); automatic re-add is a
  documented follow-up.

---

## Part 4 (optional) — the full console UI

The **Governance Console at `/console`** (covered at the top of this guide) is the clickable way to
run everything above — team auto-attach, governed-role toggles, bulk apply, member management. It
requires a Contentful OAuth app (`CF_OAUTH_CLIENT_ID` / `CF_OAUTH_REDIRECT_URI`); for a quick local
run, set the `cf_user_token` cookie to an org-admin PAT. `/members` is the inviter-only surface.

---

## Cleanup after a demo

- Delete the probe membership: Settings → Users → remove the invited test user.
- Delete the probe role: Settings → Roles & permissions → delete the "Governed" role
  (reassign any users first).
- Rotate `CF_SERVICE_TOKEN` when finished — it is a powerful org-admin token.
