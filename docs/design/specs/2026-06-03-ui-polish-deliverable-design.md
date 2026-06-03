# UI Polish + Deliverable Setup Experience — Design

- **Status:** Draft (design approved verbally; pending written-spec review)
- **Date:** 2026-06-03
- **Builds on:** the shipped console (`app/console/page.tsx`, `app/members/page.tsx`, `app/page.tsx`)
  and the delegated-governance feature. This is a **presentational + setup-experience** change —
  no governance logic or authorization behavior changes.

---

## 1. Goals

1. **Customer-facing naming** — replace internal "MVP 1 / MVP 2" labels with clear product names.
2. **Polished, branding-neutral UI** — a cohesive visual pass so the console looks like a product, via
   a single lightweight stylesheet (**no new dependencies**, no component rewrite risk).
3. **Deliverable to any Contentful org (self-deploy)** — a **first-run Setup / Health screen** so a new
   customer can stand the app up confidently (see what's configured / connected) instead of hitting
   silent failures on a missing env var. The app stays single-tenant-per-deployment, env-driven, with
   nothing org-specific hardcoded.

**Non-goals:** no multi-tenant SaaS (decided: self-deploy); no Tailwind/shadcn; no change to auth,
governance, or API behavior; no new governance features.

## 2. Naming

| Old | New section name | Subtitle |
|---|---|---|
| MVP 1 | **Org Admin Coverage** | Keep your Organization Admins attached to every space. |
| MVP 2 | **Space Role Governance** | Per-space roles with content deny-rules + delegated user management. |

Personas keep their names: **Org Admin · Space Admin · Inviter**. App title: **"Contentful Governance
Console"** (neutral; no customer references — already scrubbed from the repo).

## 3. Visual approach — lightweight CSS pass (no deps)

A single global stylesheet `app/globals.css`, imported once in `app/layout.tsx`, providing design
tokens + reusable class-based components. Pages switch from inline `style={...}` to `className`.

- **Design tokens** (CSS custom properties): neutral slate palette + one accent (indigo); spacing
  scale; radius; subtle shadow; system font stack. Defined on `:root`.
- **Components (CSS classes):** `app-header` (title + signed-in identity + sign-out), `card`
  (section container with title/subtitle), `btn` / `btn-primary` / `btn-secondary` / `btn-danger`,
  `table` (zebra rows, header style), `pill` with status variants (`pill-ok` green, `pill-warn`
  amber, `pill-bad` red, `pill-muted`), `badge` (e.g. 🛡️ protected), `input` / `select` / `label`,
  `empty-state`, `banner` (info/warn/error), `field-row` for forms.
- **Layout:** centered max-width container, consistent vertical rhythm, section cards with a clear
  heading + one-line description (the new subtitles).
- **Accessibility basics:** sufficient contrast, focus-visible outlines, buttons are real `<button>`s.

This is purely presentational: the same data, handlers, and conditionals; class names replace inline
styles. The risk surface is CSS only.

## 4. First-run Setup / Health screen

**New endpoint `GET /api/console/health`** (Org-Admin gated). Returns readiness **without leaking secret
values** — booleans + a live connectivity probe:

```jsonc
{
  "env": [ { "name": "CF_SERVICE_TOKEN", "present": true, "required": true }, ... ],   // presence only, never the value
  "orgReachable": true,        // a CMA call (e.g. get org) succeeded with the service token
  "governanceModelReady": true // denyPolicy/spaceGovernance/auditEvent content types exist in the governance space
}
```

Pure helper `summarizeHealth(env, checks)` decides overall status (`ready` / `incomplete` / `error`) and
the list of problems — unit-tested. The endpoint wraps it with the actual env presence + CMA probes.

**UI:** the org-admin console shows a **Setup** card at the top:
- ✅/❌ per required env var (name + present?), the org-reachable check, and the content-model check.
- If anything is missing/failing → an `error`/`warn` banner with the exact remediation (which env var
  to set, or "run bootstrap", or "click Seed Space Admins").
- When all green → a compact "All systems go" state, plus the existing Seed button.
Space Admins/Inviters never see Setup (org-admin only).

## 5. Files

- **Create:** `app/globals.css` (tokens + component classes); `app/api/console/health/route.ts`;
  `lib/console/health.ts` (pure `summarizeHealth` + the required-env list).
- **Modify:** `app/layout.tsx` (import globals.css; app header shell); `app/console/page.tsx`
  (class names, new section names, Setup card); `app/members/page.tsx` and `app/page.tsx`
  (class names, new title); docs (`INSTALL.md`, `DEMO.md`) to use the new names + mention the Setup screen.

## 6. Testing

- **Unit (pure):** `summarizeHealth` — all-present → `ready`; a missing required var → `incomplete`
  with that var named; a failing CMA probe → `error`. Required-env list is correct.
- **Build/typecheck:** `next build` compiles; `/api/console/health` route emits; no TS errors.
- **Manual:** org admin sees the Setup card (all green in the configured dev org); the renamed sections
  render; Space Admin view unaffected; remove a var locally → Setup shows it red with remediation.

## 7. Out of scope / follow-ups

- Dark mode, i18n, and a full design system are out of scope (YAGNI for a self-deploy console).
- A guided "install wizard" beyond the Setup/Health screen is a possible later step.
