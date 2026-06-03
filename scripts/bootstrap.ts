// One-time bootstrap: ensure the governance space has the content types the
// production surfaces write to (denyPolicy, spaceGovernance, auditEvent).
// Idempotent — creates missing content types AND adds any missing fields to
// content types that already exist (so re-running after a schema change is safe).
//
// Usage: npx tsx scripts/bootstrap.ts
// Requires CF_SERVICE_TOKEN, CF_GOVERNANCE_SPACE_ID (and optionally CF_GOVERNANCE_ENVIRONMENT_ID).
import "./load-env.ts";
import { cfGet, cfSend } from "../lib/cma/rest.ts";
import { GOVERNANCE_CONTENT_TYPES as TYPES } from "../lib/governance/content-model.ts";

const SPACE = process.env.CF_GOVERNANCE_SPACE_ID!;
const ENV = process.env.CF_GOVERNANCE_ENVIRONMENT_ID ?? "master";

interface ExistingCT { name: string; fields: { id: string }[]; sys: { id: string; version: number } }

async function main() {
  if (!SPACE) throw new Error("CF_GOVERNANCE_SPACE_ID not set");
  const existing = await cfGet<{ items: ExistingCT[] }>(`/spaces/${SPACE}/environments/${ENV}/content_types?limit=200`);
  const byId = new Map(existing.items.map((c) => [c.sys.id, c]));
  for (const t of TYPES) {
    const cur = byId.get(t.id);
    const desiredFields = t.fields.map((f) => ({ ...f, localized: false, required: false }));
    if (!cur) {
      const created = await cfSend<{ sys: { version: number } }>("PUT", `/spaces/${SPACE}/environments/${ENV}/content_types/${t.id}`,
        { name: t.name, fields: desiredFields });
      await cfSend("PUT", `/spaces/${SPACE}/environments/${ENV}/content_types/${t.id}/published`, undefined, { "X-Contentful-Version": String(created.sys.version) });
      console.log(`+ created & published ${t.id}`);
      continue;
    }
    // Already exists — add any fields it's missing (preserve existing field order/extras).
    const haveFieldIds = new Set(cur.fields.map((f) => f.id));
    const missing = desiredFields.filter((f) => !haveFieldIds.has(f.id));
    if (missing.length === 0) { console.log(`= ${t.id} up to date, skipping`); continue; }
    const merged = [...cur.fields, ...missing];
    const updated = await cfSend<{ sys: { version: number } }>("PUT", `/spaces/${SPACE}/environments/${ENV}/content_types/${t.id}`,
      { name: cur.name, fields: merged }, { "X-Contentful-Version": String(cur.sys.version) });
    await cfSend("PUT", `/spaces/${SPACE}/environments/${ENV}/content_types/${t.id}/published`, undefined, { "X-Contentful-Version": String(updated.sys.version) });
    console.log(`~ updated ${t.id}: added field(s) ${missing.map((f) => f.id).join(", ")}`);
  }
  console.log(`\nGovernance content model ready in space ${SPACE} (${ENV}).`);
}
main().catch((e) => { console.error(e); process.exit(1); });
