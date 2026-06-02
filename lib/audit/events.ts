export type AuditEventType =
  | "POLICY_DEFINED" | "POLICY_ASSIGNED"
  | "ROLE_CREATED" | "ROLE_UPDATED" | "ADMIN_MIGRATED"
  | "MEMBER_ADDED" | "MEMBER_REMOVED"
  | "PROTECTED_REMOVAL_DETECTED" | "RECONCILE_RUN" | "ERROR";

export interface AuditEvent {
  eventType: AuditEventType;
  spaceId?: string;
  actorUserId: string;
  details: Record<string, unknown>;
  timestamp: string;
}

export function buildAuditEvent(
  eventType: AuditEventType,
  opts: { spaceId?: string; actorUserId?: string; details?: Record<string, unknown> },
): AuditEvent {
  return {
    eventType,
    spaceId: opts.spaceId,
    actorUserId: opts.actorUserId ?? "system",
    details: opts.details ?? {},
    timestamp: new Date().toISOString(),
  };
}
