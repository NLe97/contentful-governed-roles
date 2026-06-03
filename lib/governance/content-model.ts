import { cma, withRetry } from "@/lib/cma/client";

export interface ContentTypeField { id: string; name: string; type: string }
export interface ContentTypeDef { id: string; name: string; fields: ContentTypeField[] }

/**
 * Canonical governance content model — the single source of truth for the content
 * types the production surfaces read/write. Both the in-app provisioner
 * (`ensureContentModel`) and the CLI (`scripts/bootstrap.ts`) consume this list so
 * they can never drift apart.
 */
export const GOVERNANCE_CONTENT_TYPES: ContentTypeDef[] = [
  { id: "denyPolicy", name: "Deny Policy", fields: [
    { id: "name", name: "Name", type: "Symbol" },
    { id: "description", name: "Description", type: "Text" },
    { id: "denies", name: "Denies", type: "Object" },
  ]},
  { id: "spaceGovernance", name: "Space Governance", fields: [
    { id: "spaceId", name: "Space ID", type: "Symbol" },
    { id: "spaceName", name: "Space Name", type: "Symbol" },
    { id: "policyRef", name: "Policy Ref", type: "Symbol" },
    { id: "inviterUserIds", name: "Inviter User IDs", type: "Object" },
    { id: "governedRoleId", name: "Governed Role ID", type: "Symbol" },
    { id: "rolloutStatus", name: "Rollout Status", type: "Symbol" },
    { id: "adminUserIds", name: "Admin User IDs", type: "Object" },
    { id: "lastSeededAt", name: "Last Seeded At", type: "Date" },
  ]},
  { id: "auditEvent", name: "Audit Event", fields: [
    { id: "eventType", name: "Event Type", type: "Symbol" },
    { id: "spaceId", name: "Space ID", type: "Symbol" },
    { id: "actorUserId", name: "Actor User ID", type: "Symbol" },
    { id: "details", name: "Details", type: "Object" },
    { id: "timestamp", name: "Timestamp", type: "Date" },
  ]},
];

/**
 * Provision the governance content model in the governance space. Idempotent:
 * creates any missing content types AND back-fills any missing fields on content
 * types that already exist (so it repairs a partially-provisioned space and is safe
 * to re-run). Mirrors `scripts/bootstrap.ts` via the shared definition list above.
 */
export async function ensureContentModel(): Promise<void> {
  const space = await withRetry(() => cma().getSpace(process.env.CF_GOVERNANCE_SPACE_ID!));
  const env = await withRetry(() => space.getEnvironment(process.env.CF_GOVERNANCE_ENVIRONMENT_ID ?? "master"));
  const existing = await withRetry(() => env.getContentTypes());
  const byId = new Map(existing.items.map((c) => [c.sys.id, c]));

  for (const def of GOVERNANCE_CONTENT_TYPES) {
    const desiredFields = def.fields.map((f) => ({ ...f, localized: false, required: false }));
    const cur = byId.get(def.id);
    if (!cur) {
      const ct = await withRetry(() => env.createContentTypeWithId(def.id, { name: def.name, fields: desiredFields as never }));
      await withRetry(() => ct.publish());
      continue;
    }
    // Already exists — add any fields it's missing (preserve existing fields/order).
    const haveFieldIds = new Set(cur.fields.map((f) => f.id));
    const missing = desiredFields.filter((f) => !haveFieldIds.has(f.id));
    if (missing.length === 0) continue;
    cur.fields = [...cur.fields, ...(missing as never[])];
    const updated = await withRetry(() => cur.update());
    await withRetry(() => updated.publish());
  }
}
