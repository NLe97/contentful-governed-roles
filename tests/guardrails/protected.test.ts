import { describe, it, expect } from "vitest";
import { isProtectedRemoval, assertRemovable } from "@/lib/guardrails/protected";

const ctx = { protectedTeamId: "team-org-admins", orgAdminOwnerUserIds: ["u-protected-2", "u-protected-1"] };

describe("isProtectedRemoval", () => {
  it("flags removal of the protected team", () => {
    expect(isProtectedRemoval({ kind: "team", id: "team-org-admins" }, ctx)).toBe(true);
  });
  it("flags removal of an org admin/owner user", () => {
    expect(isProtectedRemoval({ kind: "user", id: "u-protected-1" }, ctx)).toBe(true);
  });
  it("allows removal of an ordinary user", () => {
    expect(isProtectedRemoval({ kind: "user", id: "u-contractor" }, ctx)).toBe(false);
  });
});

describe("assertRemovable", () => {
  it("throws on a protected removal", () => {
    expect(() => assertRemovable({ kind: "user", id: "u-protected-2" }, ctx)).toThrow(/protected/i);
  });
  it("does not throw on an ordinary removal", () => {
    expect(() => assertRemovable({ kind: "user", id: "u-x" }, ctx)).not.toThrow();
  });
});
