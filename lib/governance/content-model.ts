import { cma, withRetry } from "@/lib/cma/client";

export async function ensureContentModel(): Promise<void> {
  const space = await withRetry(() => cma().getSpace(process.env.CF_GOVERNANCE_SPACE_ID!));
  const env = await withRetry(() => space.getEnvironment(process.env.CF_GOVERNANCE_ENVIRONMENT_ID ?? "master"));
  const existing = await withRetry(() => env.getContentTypes());
  const have = new Set(existing.items.map((c) => c.sys.id));

  const defs: { id: string; name: string; fields: { id: string; name: string; type: string; items?: unknown }[] }[] = [
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
    ]},
    { id: "auditEvent", name: "Audit Event", fields: [
      { id: "eventType", name: "Event Type", type: "Symbol" },
      { id: "spaceId", name: "Space ID", type: "Symbol" },
      { id: "actorUserId", name: "Actor User ID", type: "Symbol" },
      { id: "details", name: "Details", type: "Object" },
      { id: "timestamp", name: "Timestamp", type: "Date" },
    ]},
  ];

  for (const def of defs) {
    if (have.has(def.id)) continue;
    const ct = await withRetry(() => env.createContentTypeWithId(def.id, { name: def.name, fields: def.fields as never }));
    await withRetry(() => ct.publish());
  }
}
