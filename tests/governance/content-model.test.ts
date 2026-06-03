import { describe, it, expect } from "vitest";
import { GOVERNANCE_CONTENT_TYPES } from "@/lib/governance/content-model";

// These assertions lock the content-model definition against the fields the
// production surfaces actually read/write (lib/governance/store.ts). If the app
// starts writing a new field, add it here and to GOVERNANCE_CONTENT_TYPES — this
// is what keeps the in-app provisioner and scripts/bootstrap.ts from drifting.
function ct(id: string) {
  const t = GOVERNANCE_CONTENT_TYPES.find((c) => c.id === id);
  if (!t) throw new Error(`missing content type: ${id}`);
  return t;
}
const fieldIds = (id: string) => ct(id).fields.map((f) => f.id);

describe("GOVERNANCE_CONTENT_TYPES", () => {
  it("defines exactly the three governance content types", () => {
    expect(GOVERNANCE_CONTENT_TYPES.map((c) => c.id).sort()).toEqual(
      ["auditEvent", "denyPolicy", "spaceGovernance"],
    );
  });

  it("spaceGovernance includes the delegated-access fields the app writes", () => {
    // adminUserIds + lastSeededAt are written by the Import Space Admins flow;
    // these were the fields that had drifted out of ensureContentModel().
    for (const f of ["spaceId", "spaceName", "policyRef", "inviterUserIds",
      "governedRoleId", "rolloutStatus", "adminUserIds", "lastSeededAt"]) {
      expect(fieldIds("spaceGovernance")).toContain(f);
    }
  });

  it("denyPolicy and auditEvent carry their expected fields", () => {
    expect(fieldIds("denyPolicy")).toEqual(["name", "description", "denies"]);
    for (const f of ["eventType", "spaceId", "actorUserId", "details", "timestamp"]) {
      expect(fieldIds("auditEvent")).toContain(f);
    }
  });

  it("every field has a non-empty id, name, and type", () => {
    for (const t of GOVERNANCE_CONTENT_TYPES) {
      for (const f of t.fields) {
        expect(f.id).toBeTruthy();
        expect(f.name).toBeTruthy();
        expect(f.type).toBeTruthy();
      }
    }
  });
});
