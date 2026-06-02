import { describe, it, expect } from "vitest";
import { buildAuditEvent } from "@/lib/audit/events";

describe("buildAuditEvent", () => {
  it("builds a normalized event with an ISO timestamp", () => {
    const e = buildAuditEvent("MEMBER_ADDED", {
      spaceId: "s1", actorUserId: "u1", details: { addedUserId: "u2" },
    });
    expect(e.eventType).toBe("MEMBER_ADDED");
    expect(e.spaceId).toBe("s1");
    expect(e.actorUserId).toBe("u1");
    expect(e.details).toEqual({ addedUserId: "u2" });
    expect(() => new Date(e.timestamp).toISOString()).not.toThrow();
  });

  it("defaults actor to 'system' and tolerates no spaceId", () => {
    const e = buildAuditEvent("RECONCILE_RUN", { details: { swept: 12 } });
    expect(e.actorUserId).toBe("system");
    expect(e.spaceId).toBeUndefined();
  });
});
