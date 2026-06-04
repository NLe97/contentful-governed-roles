# Pointing the app at a different Contentful org (local testing)

This retargets an **existing local checkout** at a new organization for testing. You don't need
to redeploy anything — this app is **single-tenant per configuration**: nothing org-specific lives
in the code, only in `.env`. "Switching orgs" means swap four `.env` values, re-provision the data
model, and restart.

The four values you change:

| Variable | What it is | Why it matters |
|---|---|---|
| `CF_SERVICE_TOKEN` | A Contentful **Personal Access Token (PAT)** held by an Org Admin of the new org | Every privileged action uses this token. If it can't reach the org, nothing works. |
| `CF_ORG_ID` | The new organization's ID | Tells the app which org to operate on. |
| `CF_GOVERNANCE_SPACE_ID` | A space **inside the new org** used as the app's database | Stores deny policies, per-space config, and the audit log as entries. No external DB. |
| `CF_PROTECTED_TEAM_ID` | The "Org Admins" team **inside the new org** | The team the app keeps attached to every space and protects from removal. |

For **testing** you do *not* need the OAuth variables. Instead use the **cookie shortcut**: set a
browser cookie `cf_user_token` to your PAT and the app treats you as that signed-in user. (For a
real production login flow, set up OAuth per [`INSTALL.md`](../INSTALL.md) Step 3.)

> **Why a separate governance space (`CF_GOVERNANCE_SPACE_ID`)?** The governed spaces already store the
> **enforcement** (roles, memberships) natively, but Contentful has no native place for the app's
> **intent and bookkeeping**: who is a *delegated* Space Admin/Inviter per space (`spaceGovernance`),
> reusable named deny policies (`denyPolicy`), and the action log (`auditEvent`). Those drive the
> delegation, drift-detection, and audit features. The app creates content types and entries **only in
> this one space** — your governed (content) spaces never receive governance types, audit entries, or
> any content. Use a **dedicated empty** space so its footprint stays obvious. Full explanation:
> [INSTALL.md → Why a governance space at all?](../INSTALL.md#why-a-governance-space-at-all-if-youre-already-governing-other-spaces).

> All commands assume the project directory and Node 20:
> ```bash
> cd <repo>
> . "$HOME/.nvm/nvm.sh" && nvm use 20
> ```

---

## Step 1 — Back up the current `.env`

```bash
cp .env .env.org1.bak
```

This lets you return to the current org with one command (Step 9).

## Step 2 — Get the new organization's ID

1. Sign in to <https://app.contentful.com> with an account that is an **Org Admin/Owner** of the new org.
2. Switch to the new org (org switcher, top-left).
3. **Organization settings** → the **Organization ID** is on the settings/billing page (a ~22-char string like `30SScScam27l3EU95xxctv`). It's also in the URL: `…/organizations/<ORG_ID>/…`.

## Step 3 — Mint a service token (PAT) for the new org

A PAT is tied to **your user** and can reach every org/space that account belongs to.

1. Go to <https://app.contentful.com/account/profile/cma_tokens> (**Account settings → Tokens → Personal Access Tokens**).
2. **Create personal access token** → name it e.g. `governance-app-<neworg>-test` → **Generate**.
3. **Copy it now** — Contentful shows it once. It begins with `CFPAT-…`. Treat it as a secret; rotate after testing.

> ⚠️ The account owning this PAT must be an **Org Admin/Owner** of the new org, or the `/api/console/*`
> endpoints return **403**. Confirm your role in the org's **Organization settings → Users/Teams**.

## Step 4 — Put the org ID and token into `.env`

Edit `.env` (no quotes, no spaces around `=`):

```
CF_SERVICE_TOKEN=CFPAT-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
CF_ORG_ID=<new org id>
```

Leave `CF_GOVERNANCE_SPACE_ID` / `CF_PROTECTED_TEAM_ID` for Step 6. Sanity-check (prints no secret):

```bash
grep -E '^CF_ORG_ID=' .env
grep -E '^CF_SERVICE_TOKEN=' .env | sed 's/=.*/=<set>/'
```

## Step 5 — Discover the governance space and protected team

```bash
npx tsx scripts/discover-org.ts
```

Prints the new org's **spaces** (`<spaceId>  <name>`) and **teams** (`<teamId>  <name>`).

- **Governance space:** pick an **empty/dedicated** space — the app creates its own content types and
  entries there; don't use a content-heavy production space. No suitable space? Create an empty one in
  the UI (**+ Add space**), then re-run discovery.
- **Protected team:** pick your Org Admins team (often named "Org Admins"). None? Create one in
  **Organization settings → Teams**, add your admins, re-run discovery.

If it errors: `401` → bad token; `403` → token's account isn't an Org Admin of this org, or wrong org id;
empty/"CF_ORG_ID not set" → Step 4 didn't save.

## Step 6 — Put the space and team IDs into `.env`

```
CF_GOVERNANCE_SPACE_ID=<space id>
CF_PROTECTED_TEAM_ID=<Org Admins team id>
CF_GOVERNANCE_ENVIRONMENT_ID=master   # optional; defaults to master
```

Confirm all four are set:

```bash
grep -E '^CF_(ORG_ID|GOVERNANCE_SPACE_ID|PROTECTED_TEAM_ID)=' .env
grep -E '^CF_SERVICE_TOKEN=' .env | sed 's/=.*/=<set>/'
```

## Step 7 — Provision the governance content model

Creates `denyPolicy`, `spaceGovernance`, `auditEvent` in the chosen space. Idempotent:

```bash
npx tsx scripts/bootstrap.ts
```

Expected (first run): `+ created & published …` ×3, then `Governance content model ready …`.
Re-runs print `= … up to date, skipping`.

> Alternative: do it from the browser after Step 8 — the **Setup & Health** card has a
> **"Provision content model"** button.

## Step 8 — Restart the dev server (env loads at startup)

```bash
pkill -f "next dev"   # stop the old one
npm run dev           # note the port it prints (3000/3001/…)
```

> 🛑 Do **not** run `npm run build` while `npm run dev` is running — it corrupts `.next` and you'll get
> `Cannot find module './xxx.js'` 500s. Fix: `pkill -f "next dev"; rm -rf .next; npm run dev`.
> (`bootstrap.ts` is safe to run alongside dev; only `build` conflicts.)

## Step 9 — Verify it's pointed at the new org

Terminal (replace `3000` with your port):

```bash
TOK=$(grep -E '^CF_SERVICE_TOKEN=' .env | cut -d= -f2- | tr -d '"')
curl -s --cookie "cf_user_token=$TOK" http://localhost:3000/api/console/health \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print("status:",d["status"],"| orgReachable:",d["orgReachable"],"| modelReady:",d["governanceModelReady"])'
```

Expected: `status: ready | orgReachable: True | modelReady: True`.

Browser (real UI):
1. Open `http://localhost:<port>/console` (you'll see "Sign in required").
2. DevTools → **Application/Storage → Cookies → http://localhost:<port>** → add cookie
   **Name** `cf_user_token`, **Value** your `CFPAT-…`, **Domain** `localhost`, **Path** `/`.
3. Reload `/console` → you land on the **Org Admin** view; the **Setup & Health** card is all green.
4. Under **Org Admin Coverage**, click **Refresh** → the spaces shown should be the **new** org's.

## Step 10 — (Optional) Scale test against the new org

Creates throwaway `gov-scale-NNN` spaces — only in a test org that can spare the count:

```bash
SCALE_COUNT=80 SCALE_ADMIN_EMAIL=you@example.com npx tsx scripts/scale-provision.ts
# ...exercise bulk actions in /console: Attach team to ALL, Apply governed to ALL, Remove from ALL...
npx tsx scripts/scale-teardown.ts   # delete every gov-scale-* space
```

Re-run `npx tsx scripts/discover-org.ts` afterward to confirm no `gov-scale-*` spaces remain.

## Step 11 — Switch back to the original org

```bash
pkill -f "next dev"
cp .env.org1.bak .env
npm run dev
```

Re-run the Step 9 health check to confirm you're back.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `health` → `orgReachable: False` | Token invalid / not for this account / wrong `CF_ORG_ID` | Recheck Steps 2–4; regenerate PAT |
| `/api/console/*` → **403** "org admin required" | Token's account isn't an Org Admin of the new org | Use a token from an admin account, or add the account to the org admin team |
| `health` → `modelReady: False` | Content model not provisioned in the chosen space | Re-run `npx tsx scripts/bootstrap.ts` (Step 7) |
| `health` → `status: incomplete` | A required env var is blank | Read the `problems` array; fill the named var; restart dev |
| 500s / `Cannot find module './xxx.js'` | `.next` corrupted (`build` ran while `dev` running) | `pkill -f "next dev"; rm -rf .next; npm run dev` |
| Discovery/bootstrap can't see new values | `.env` not saved, or dev not restarted | Re-save `.env`; env changes need a dev restart (Step 8) |

The behavior (bulk actions, personas, protected-identity guardrails) is identical across orgs — it's
the same code pointed at different data.
