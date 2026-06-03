# UI Polish + Deliverable Setup Experience — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the console UI (cohesive stylesheet, customer-facing section names) and add a first-run Setup/Health screen so any Contentful org can self-deploy it confidently.

**Architecture:** Presentational change only — no governance/auth behavior changes. One global stylesheet (`app/globals.css`, no new deps) replaces inline styles via class names; sections renamed ("Org Admin Coverage", "Space Role Governance"). A pure `summarizeHealth` helper + an Org-Admin `GET /api/console/health` endpoint (presence booleans + live CMA probes, never secret values) drive a Setup card at the top of the org-admin console.

**Tech Stack:** Next.js (App Router), TypeScript, Node 20, npm, Vitest. Run Node 20 via `. "$HOME/.nvm/nvm.sh" && nvm use 20`.

**Spec:** `docs/design/specs/2026-06-03-ui-polish-deliverable-design.md`

---

## File Structure

```
lib/console/health.ts            # NEW pure: REQUIRED_ENV/OPTIONAL_ENV + summarizeHealth
app/api/console/health/route.ts  # NEW: org-admin gated; env presence + CMA probes
app/globals.css                  # NEW: design tokens + component classes (no deps)
app/layout.tsx                   # MODIFY: import globals.css; neutral title
app/console/page.tsx             # MODIFY: class names, renamed sections, Setup card
app/members/page.tsx             # MODIFY: class names, new title
app/page.tsx                     # MODIFY: class names, new title
tests/console/health.test.ts     # NEW
INSTALL.md / DEMO.md             # MODIFY: new names + Setup screen mention
```

---

## Task 1: Health summary helper (pure)

**Files:**
- Create: `lib/console/health.ts`
- Test: `tests/console/health.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/console/health.test.ts
import { describe, it, expect } from "vitest";
import { summarizeHealth, REQUIRED_ENV, type EnvVarStatus } from "@/lib/console/health";

const allPresent: EnvVarStatus[] = REQUIRED_ENV.map((name) => ({ name, present: true, required: true }));

describe("summarizeHealth", () => {
  it("is ready when all required env present and probes pass", () => {
    const r = summarizeHealth(allPresent, { orgReachable: true, governanceModelReady: true });
    expect(r.status).toBe("ready");
    expect(r.problems).toEqual([]);
  });
  it("is incomplete and names a missing required env (probes ok)", () => {
    const env = allPresent.map((e) => (e.name === "CF_OAUTH_CLIENT_ID" ? { ...e, present: false } : e));
    const r = summarizeHealth(env, { orgReachable: true, governanceModelReady: true });
    expect(r.status).toBe("incomplete");
    expect(r.problems.some((p) => p.includes("CF_OAUTH_CLIENT_ID"))).toBe(true);
  });
  it("is error when the org is unreachable", () => {
    const r = summarizeHealth(allPresent, { orgReachable: false, governanceModelReady: true });
    expect(r.status).toBe("error");
    expect(r.problems.some((p) => /reach the organization/i.test(p))).toBe(true);
  });
  it("is error when the governance content model is missing", () => {
    const r = summarizeHealth(allPresent, { orgReachable: true, governanceModelReady: false });
    expect(r.status).toBe("error");
    expect(r.problems.some((p) => /bootstrap/i.test(p))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `. "$HOME/.nvm/nvm.sh" && nvm use 20 >/dev/null && npx vitest run tests/console/health.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// lib/console/health.ts
export interface EnvVarStatus { name: string; present: boolean; required: boolean }
export interface HealthChecks { orgReachable: boolean; governanceModelReady: boolean }
export type HealthStatus = "ready" | "incomplete" | "error";
export interface HealthSummary { status: HealthStatus; problems: string[] }

export const REQUIRED_ENV = [
  "CF_SERVICE_TOKEN", "CF_ORG_ID", "CF_GOVERNANCE_SPACE_ID",
  "CF_PROTECTED_TEAM_ID", "CF_OAUTH_CLIENT_ID", "CF_OAUTH_REDIRECT_URI",
];
export const OPTIONAL_ENV = ["CF_GOVERNANCE_ENVIRONMENT_ID", "CF_WEBHOOK_SECRET", "CRON_SECRET"];

export function summarizeHealth(env: EnvVarStatus[], checks: HealthChecks): HealthSummary {
  const problems: string[] = [];
  for (const e of env) if (e.required && !e.present) problems.push(`Missing required environment variable: ${e.name}`);
  if (!checks.orgReachable) problems.push("Service token cannot reach the organization (check CF_SERVICE_TOKEN / CF_ORG_ID)");
  if (!checks.governanceModelReady) problems.push("Governance content model missing — run scripts/bootstrap.ts against the governance space");

  const missingRequired = env.some((e) => e.required && !e.present);
  let status: HealthStatus;
  if (!checks.orgReachable || !checks.governanceModelReady) status = "error";
  else if (missingRequired) status = "incomplete";
  else status = "ready";
  return { status, problems };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `. "$HOME/.nvm/nvm.sh" && nvm use 20 >/dev/null && npx vitest run tests/console/health.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/console/health.ts tests/console/health.test.ts
git commit -m "feat(health): summarizeHealth + required-env list"
```

---

## Task 2: Health endpoint

**Files:**
- Create: `app/api/console/health/route.ts`

- [ ] **Step 1: Write the route**

```ts
// app/api/console/health/route.ts
import { NextRequest, NextResponse } from "next/server";
import { authorizeOrgAdmin } from "@/lib/auth/require-request";
import { REQUIRED_ENV, OPTIONAL_ENV, summarizeHealth, type EnvVarStatus } from "@/lib/console/health";
import { cfGet } from "@/lib/cma/rest";

export async function GET(req: NextRequest) {
  const auth = await authorizeOrgAdmin(req); if ("error" in auth) return auth.error;

  const env: EnvVarStatus[] = [
    ...REQUIRED_ENV.map((name) => ({ name, present: Boolean(process.env[name]), required: true })),
    ...OPTIONAL_ENV.map((name) => ({ name, present: Boolean(process.env[name]), required: false })),
  ];

  let orgReachable = false;
  try { await cfGet(`/organizations/${process.env.CF_ORG_ID}`); orgReachable = true; } catch { /* stays false */ }

  let governanceModelReady = false;
  try {
    const envId = process.env.CF_GOVERNANCE_ENVIRONMENT_ID ?? "master";
    const ct = await cfGet<{ items: { sys: { id: string } }[] }>(`/spaces/${process.env.CF_GOVERNANCE_SPACE_ID}/environments/${envId}/content_types?limit=200`);
    const ids = new Set(ct.items.map((c) => c.sys.id));
    governanceModelReady = ["denyPolicy", "spaceGovernance", "auditEvent"].every((id) => ids.has(id));
  } catch { /* stays false */ }

  const summary = summarizeHealth(env, { orgReachable, governanceModelReady });
  return NextResponse.json({ env, orgReachable, governanceModelReady, ...summary });
}
```

- [ ] **Step 2: Verify**

Run: `. "$HOME/.nvm/nvm.sh" && nvm use 20 >/dev/null && npm run typecheck && npm run build 2>&1 | grep -E "Compiled|/api/console/health|error" | head`
Expected: typecheck clean; build compiles `/api/console/health`.

- [ ] **Step 3: Commit**

```bash
git add app/api/console/health/route.ts
git commit -m "feat(api): /api/console/health (presence + live probes, no secrets)"
```

---

## Task 3: Global stylesheet + layout

**Files:**
- Create: `app/globals.css`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Create `app/globals.css`**

```css
/* app/globals.css — design tokens + lightweight component classes (no deps) */
:root {
  --bg: #f6f7f9; --surface: #ffffff; --border: #e3e6ea; --text: #1b2430; --muted: #5b6675;
  --accent: #4f46e5; --accent-fg: #ffffff;
  --ok-bg: #e7f6ec; --ok-fg: #1c7a43; --warn-bg: #fdf3e0; --warn-fg: #a86508;
  --bad-bg: #fcebec; --bad-fg: #b42330; --muted-bg: #eef0f3; --muted-fg: #5b6675;
  --radius: 10px; --shadow: 0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.1);
  --space: 8px;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { background: var(--bg); color: var(--text); font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
a { color: var(--accent); }
.container { max-width: 960px; margin: 0 auto; padding: 24px 20px 64px; }
.app-header { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--border); margin-bottom: 24px; }
.app-header h1 { font-size: 20px; margin: 0; }
.app-header .who { color: var(--muted); font-size: 13px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 20px; margin-bottom: 20px; }
.card > h2 { font-size: 16px; margin: 0 0 2px; }
.card > .sub { color: var(--muted); font-size: 13px; margin: 0 0 16px; }
.btn { font: inherit; padding: 7px 13px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; }
.btn:hover { border-color: #c9ced6; }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.btn-primary { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
.btn-primary:hover { filter: brightness(1.05); }
.btn-danger { background: var(--bad-bg); border-color: #f3c6ca; color: var(--bad-fg); }
.btn + .btn { margin-left: 8px; }
table.table { width: 100%; border-collapse: collapse; font-size: 14px; }
.table th { text-align: left; color: var(--muted); font-weight: 600; border-bottom: 1px solid var(--border); padding: 8px 10px; }
.table td { border-bottom: 1px solid var(--border); padding: 8px 10px; }
.table tr:last-child td { border-bottom: 0; }
.pill { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.pill-ok { background: var(--ok-bg); color: var(--ok-fg); }
.pill-warn { background: var(--warn-bg); color: var(--warn-fg); }
.pill-bad { background: var(--bad-bg); color: var(--bad-fg); }
.pill-muted { background: var(--muted-bg); color: var(--muted-fg); }
.badge { font-size: 12px; color: var(--muted); }
.banner { border-radius: 8px; padding: 10px 14px; font-size: 14px; margin-bottom: 16px; }
.banner-info { background: var(--muted-bg); color: var(--text); }
.banner-warn { background: var(--warn-bg); color: var(--warn-fg); }
.banner-error { background: var(--bad-bg); color: var(--bad-fg); }
label.label { display: inline-flex; gap: 6px; align-items: center; color: var(--muted); font-size: 13px; margin-right: 12px; }
input.input, select.select { font: inherit; padding: 6px 9px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); }
.field-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 10px 0; }
.empty-state { color: var(--muted); text-align: center; padding: 28px; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
pre { background: #0f172a0a; padding: 12px; border-radius: 8px; overflow: auto; font-size: 12px; }
```

- [ ] **Step 2: Update `app/layout.tsx` to import the stylesheet**

```tsx
// app/layout.tsx
import "./globals.css";

export const metadata = { title: "Contentful Governance Console" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```
(If the existing layout used `ReactNode` import, keep whatever compiles; only add the `import "./globals.css";` and the title.)

- [ ] **Step 3: Verify build**

Run: `. "$HOME/.nvm/nvm.sh" && nvm use 20 >/dev/null && npm run build 2>&1 | grep -E "Compiled|error|Failed" | head`
Expected: compiles (global CSS picked up).

- [ ] **Step 4: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat(ui): global stylesheet (design tokens + components) + neutral title"
```

---

## Task 4: Console — restyle, rename, Setup card

**Files:**
- Modify: `app/console/page.tsx`

This page is the persona-aware console (`"use client"`). **Preserve every handler, fetch, persona branch, and conditional.** Change presentation (inline `style=` → `className=`), rename sections, and add the Setup card. Read the file first.

- [ ] **Step 1: Wrap content + app header**

Wrap the returned JSX in `<main className="container">`. At the top render an app header:
```tsx
<div className="app-header">
  <h1>Contentful Governance Console</h1>
  <span className="who">{me ? `Signed in${me.identity ? " · " + (me.persona) : ""}` : ""}</span>
</div>
```
Replace the existing inline-styled `box`/`btn` objects with class names: section containers → `className="card"` with `<h2>` title + `<p className="sub">` subtitle; buttons → `className="btn"` (primary action → `btn btn-primary`, destructive → `btn btn-danger`); tables → `className="table"`; inputs → `className="input"`, selects → `className="select"`, labels → `className="label"`; the 🛡️ protected marker → `<span className="badge">🛡️ protected</span>`; error display → `<div className="banner banner-error">`. Remove the old `box`/`btn` style consts.

- [ ] **Step 2: Rename the sections**

- The MVP 1 section heading → `<h2>Org Admin Coverage</h2><p className="sub">Keep your Organization Admins attached to every space.</p>`
- The MVP 2 section heading → `<h2>Space Role Governance</h2><p className="sub">Per-space roles with content deny-rules and delegated user management.</p>`
- Any visible "MVP 1"/"MVP 2" strings elsewhere in this file → use the new names.

- [ ] **Step 3: Add the Setup card (org admin only)**

Add state + loader and render a Setup card at the top of the org-admin branch (before Org Admin Coverage):
```tsx
const [health, setHealth] = useState<null | { status: string; problems: string[]; env: { name: string; present: boolean; required: boolean }[]; orgReachable: boolean; governanceModelReady: boolean }>(null);
async function loadHealth() { try { setHealth(await call("/api/console/health")); } catch { /* err shown */ } }
useEffect(() => { if (me?.persona === "orgAdmin") loadHealth(); }, [me?.persona]);
```
```tsx
{me?.persona === "orgAdmin" && health && (
  <section className="card">
    <h2>Setup &amp; Health</h2>
    <p className="sub">Configuration and connectivity for this deployment.</p>
    <div className={`banner ${health.status === "ready" ? "banner-info" : health.status === "incomplete" ? "banner-warn" : "banner-error"}`}>
      {health.status === "ready" ? "All systems go." : health.problems.join(" · ")}
    </div>
    <table className="table">
      <thead><tr><th>Check</th><th>Status</th></tr></thead>
      <tbody>
        {health.env.map((e) => (
          <tr key={e.name}><td className="mono">{e.name}{e.required ? "" : " (optional)"}</td>
            <td>{e.present ? <span className="pill pill-ok">set</span> : <span className={`pill ${e.required ? "pill-bad" : "pill-muted"}`}>{e.required ? "missing" : "unset"}</span>}</td></tr>
        ))}
        <tr><td>Org reachable (service token)</td><td>{health.orgReachable ? <span className="pill pill-ok">ok</span> : <span className="pill pill-bad">failed</span>}</td></tr>
        <tr><td>Governance content model</td><td>{health.governanceModelReady ? <span className="pill pill-ok">ready</span> : <span className="pill pill-bad">missing</span>}</td></tr>
      </tbody>
    </table>
  </section>
)}
```
Keep the existing **Seed Space Admins** controls (restyled with classes) within or just after this card.

- [ ] **Step 4: Build**

Run: `. "$HOME/.nvm/nvm.sh" && nvm use 20 >/dev/null && npm run build 2>&1 | grep -E "Compiled|error|Failed" | head`
Expected: compiles.

- [ ] **Step 5: Commit**

```bash
git add app/console/page.tsx
git commit -m "feat(ui): restyle console, rename sections, add Setup & Health card"
```

---

## Task 5: Members + home + callback restyle/rename

**Files:**
- Modify: `app/members/page.tsx`, `app/page.tsx`

- [ ] **Step 1: Restyle `app/page.tsx` (sign-in landing)**

Wrap in `<main className="container">`; title `<h1>Contentful Governance Console</h1>`; intro `<p className="sub">…</p>`; the sign-in button → `className="btn btn-primary"`. Keep the `buildAuthorizeUrl` logic exactly.

- [ ] **Step 2: Restyle `app/members/page.tsx`**

Wrap in `<main className="container">` with an app header; section → `className="card"` with `<h2>Add a user</h2>`; inputs/selects/buttons → classes; error → `banner banner-error`. Keep all handlers/fetches unchanged.

- [ ] **Step 3: Build + full suite**

Run: `. "$HOME/.nvm/nvm.sh" && nvm use 20 >/dev/null && npm run build 2>&1 | grep -E "Compiled|error" | head && npx vitest run 2>&1 | grep -E "Tests " && npm run typecheck 2>&1 | tail -1`
Expected: compiles; all tests pass; typecheck clean.

- [ ] **Step 4: Commit**

```bash
git add app/members/page.tsx app/page.tsx
git commit -m "feat(ui): restyle members + sign-in pages"
```

---

## Task 6: Docs + final verification

**Files:**
- Modify: `INSTALL.md`, `DEMO.md`

- [ ] **Step 1: Update docs**

- Replace visible "MVP 1"/"MVP 2" with **Org Admin Coverage** / **Space Role Governance** in INSTALL.md and DEMO.md.
- In INSTALL.md verify section, add: "Open `/console` as an Org Admin → the **Setup & Health** card should show all checks green (env set, org reachable, content model ready)."

- [ ] **Step 2: Final verification**

Run: `. "$HOME/.nvm/nvm.sh" && nvm use 20 >/dev/null && npx vitest run 2>&1 | grep -E "Tests " && npm run typecheck 2>&1 | tail -1 && npm run build 2>&1 | grep -E "Compiled"`
Expected: all tests pass, typecheck clean, build compiles.

- [ ] **Step 3: Commit**

```bash
git add INSTALL.md DEMO.md
git commit -m "docs: rename sections + note Setup & Health screen"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Customer-facing naming (§2) → Tasks 4, 5, 6.
- Lightweight CSS pass, no deps (§3) → Tasks 3, 4, 5.
- Setup/Health screen + endpoint, presence-only/no secrets (§4) → Tasks 1, 2, 4.
- Files list (§5) → all tasks.
- Testing (§6): pure `summarizeHealth` unit-tested (Task 1); build/typecheck each task; manual via Setup card.

**Placeholder scan:** No TBD/TODO; pure-logic + CSS + endpoint code is complete. UI tasks (4/5) give the new card code + exact class/rename mapping to apply over the existing JSX (preserve logic) — appropriate for a restyle.

**Type consistency:** `EnvVarStatus`, `HealthChecks`, `HealthSummary`, `summarizeHealth`, `REQUIRED_ENV`/`OPTIONAL_ENV` defined once (Task 1) and reused in Task 2; the health response shape used in Task 4 matches the endpoint's JSON (`env`, `orgReachable`, `governanceModelReady`, `status`, `problems`).

**No behavior change:** governance/auth logic untouched; only presentation, naming, and the read-only health endpoint are added.
