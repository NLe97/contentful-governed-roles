import { cma, withRetry } from "@/lib/cma/client";
import type { AuditEvent } from "@/lib/audit/events";

const LOCALE = "en-US";
function f<T>(field: Record<string, T> | undefined): T | undefined { return field?.[LOCALE]; }

export interface SpaceGovernanceRow {
  spaceId: string; policyRef: string; inviterUserIds: string[]; governedRoleId?: string;
}
interface RawEntry { sys?: { id: string }; fields: Record<string, Record<string, unknown>>; }

export function pickSpaceGovernance(entries: RawEntry[], spaceId: string): SpaceGovernanceRow | null {
  const e = entries.find((x) => f(x.fields.spaceId as Record<string, string>) === spaceId);
  if (!e) return null;
  return {
    spaceId,
    policyRef: f(e.fields.policyRef as Record<string, string>) ?? "",
    inviterUserIds: (f(e.fields.inviterUserIds as Record<string, string[]>) ?? []) as string[],
    governedRoleId: f(e.fields.governedRoleId as Record<string, string>),
  };
}

async function govEnv() {
  const space = await withRetry(() => cma().getSpace(process.env.CF_GOVERNANCE_SPACE_ID!));
  return withRetry(() => space.getEnvironment(process.env.CF_GOVERNANCE_ENVIRONMENT_ID ?? "master"));
}

export async function getSpaceGovernance(spaceId: string): Promise<SpaceGovernanceRow | null> {
  const env = await govEnv();
  const res = await withRetry(() => env.getEntries({ content_type: "spaceGovernance", "fields.spaceId": spaceId }));
  return pickSpaceGovernance(res.items as unknown as RawEntry[], spaceId);
}

export interface SpaceAccessConfig { adminUserIds: string[]; inviterUserIds: string[]; }

interface RawEntryLike { fields: Record<string, Record<string, unknown>> }
export function parseAccessConfig(entry: RawEntryLike): SpaceAccessConfig {
  const a = (entry.fields.adminUserIds as Record<string, string[]> | undefined)?.[LOCALE] ?? [];
  const i = (entry.fields.inviterUserIds as Record<string, string[]> | undefined)?.[LOCALE] ?? [];
  return { adminUserIds: a as string[], inviterUserIds: i as string[] };
}

export async function getSpaceAccessConfig(spaceId: string): Promise<SpaceAccessConfig> {
  const env = await govEnv();
  const res = await withRetry(() => env.getEntries({ content_type: "spaceGovernance", "fields.spaceId": spaceId }));
  const item = (res.items as unknown as RawEntryLike[])[0];
  return item ? parseAccessConfig(item) : { adminUserIds: [], inviterUserIds: [] };
}

export async function setSpaceAccessConfig(spaceId: string, spaceName: string, cfg: Partial<SpaceAccessConfig>): Promise<void> {
  const env = await govEnv();
  const res = await withRetry(() => env.getEntries({ content_type: "spaceGovernance", "fields.spaceId": spaceId }));
  const existing = res.items[0] as any;
  const current = existing ? parseAccessConfig(existing as RawEntryLike) : { adminUserIds: [], inviterUserIds: [] };
  const fields = {
    spaceId: { [LOCALE]: spaceId },
    spaceName: { [LOCALE]: spaceName },
    adminUserIds: { [LOCALE]: cfg.adminUserIds ?? current.adminUserIds },
    inviterUserIds: { [LOCALE]: cfg.inviterUserIds ?? current.inviterUserIds },
    lastSeededAt: { [LOCALE]: new Date().toISOString() },
  };
  if (existing) { existing.fields = { ...existing.fields, ...fields }; await withRetry(() => existing.update()); }
  else { await withRetry(() => env.createEntry("spaceGovernance", { fields })); }
}

export async function appendAudit(event: AuditEvent): Promise<void> {
  const env = await govEnv();
  await withRetry(() => env.createEntry("auditEvent", {
    fields: {
      eventType: { [LOCALE]: event.eventType },
      spaceId: { [LOCALE]: event.spaceId ?? null },
      actorUserId: { [LOCALE]: event.actorUserId },
      details: { [LOCALE]: event.details },
      timestamp: { [LOCALE]: event.timestamp },
    },
  }));
}
