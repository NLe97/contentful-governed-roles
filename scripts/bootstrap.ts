// One-time bootstrap: ensure the governance space has the content types the
// production surfaces write to (denyPolicy, spaceGovernance, auditEvent).
// Idempotent — skips content types that already exist.
//
// Usage: npx tsx scripts/bootstrap.ts
// Requires CF_SERVICE_TOKEN, CF_GOVERNANCE_SPACE_ID (and optionally CF_GOVERNANCE_ENVIRONMENT_ID).
import "./load-env.ts";
import { cfGet, cfSend } from "../lib/cma/rest.ts";

const SPACE = process.env.CF_GOVERNANCE_SPACE_ID!;
const ENV = process.env.CF_GOVERNANCE_ENVIRONMENT_ID ?? "master";

const TYPES: { id: string; name: string; fields: { id: string; name: string; type: string }[] }[] = [
  { id: "denyPolicy", name: "Deny Policy", fields: [
    { id: "name", name: "Name", type: "Symbol" },
    { id: "description", name: "Description", type: "Text" },
    { id: "denies", name: "Denies", type: "Object" },
  ] },
  { id: "spaceGovernance", name: "Space Governance", fields: [
    { id: "spaceId", name: "Space ID", type: "Symbol" },
    { id: "spaceName", name: "Space Name", type: "Symbol" },
    { id: "policyRef", name: "Policy Ref", type: "Symbol" },
    { id: "inviterUserIds", name: "Inviter User IDs", type: "Object" },
    { id: "governedRoleId", name: "Governed Role ID", type: "Symbol" },
    { id: "rolloutStatus", name: "Rollout Status", type: "Symbol" },
    { id: "adminUserIds", name: "Admin User IDs", type: "Object" },
    { id: "lastSeededAt", name: "Last Seeded At", type: "Date" },
  ] },
  { id: "auditEvent", name: "Audit Event", fields: [
    { id: "eventType", name: "Event Type", type: "Symbol" },
    { id: "spaceId", name: "Space ID", type: "Symbol" },
    { id: "actorUserId", name: "Actor User ID", type: "Symbol" },
    { id: "details", name: "Details", type: "Object" },
    { id: "timestamp", name: "Timestamp", type: "Date" },
  ] },
];

async function main() {
  if (!SPACE) throw new Error("CF_GOVERNANCE_SPACE_ID not set");
  const existing = await cfGet<{ items: { sys: { id: string } }[] }>(`/spaces/${SPACE}/environments/${ENV}/content_types?limit=200`);
  const have = new Set(existing.items.map((c) => c.sys.id));
  for (const t of TYPES) {
    if (have.has(t.id)) { console.log(`= ${t.id} already exists, skipping`); continue; }
    const created = await cfSend<{ sys: { version: number } }>("PUT", `/spaces/${SPACE}/environments/${ENV}/content_types/${t.id}`,
      { name: t.name, fields: t.fields.map((f) => ({ ...f, localized: false, required: false })) });
    await cfSend("PUT", `/spaces/${SPACE}/environments/${ENV}/content_types/${t.id}/published`, undefined, { "X-Contentful-Version": String(created.sys.version) });
    console.log(`+ created & published ${t.id}`);
  }
  console.log(`\nGovernance content model ready in space ${SPACE} (${ENV}).`);
}
main().catch((e) => { console.error(e); process.exit(1); });
