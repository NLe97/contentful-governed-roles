import { describe, it, expect } from "vitest";
import { canManageMembers, requireOrgAdmin } from "@/lib/auth/authorize";

const orgAdmin = { userId: "u-admin", isOrgAdmin: true };
const inviter = { userId: "u-inviter", isOrgAdmin: false };
const stranger = { userId: "u-other", isOrgAdmin: false };
const gov = { spaceId: "s1", inviterUserIds: ["u-inviter"] };

describe("canManageMembers", () => {
  it("allows an org admin anywhere", () => {
    expect(canManageMembers(orgAdmin, gov)).toBe(true);
  });
  it("allows a user on the space's inviter allowlist", () => {
    expect(canManageMembers(inviter, gov)).toBe(true);
  });
  it("denies a user not on the allowlist and not an org admin", () => {
    expect(canManageMembers(stranger, gov)).toBe(false);
  });
});

describe("requireOrgAdmin", () => {
  it("throws for non-org-admins", () => {
    expect(() => requireOrgAdmin(inviter)).toThrow(/org admin/i);
  });
  it("passes for org admins", () => {
    expect(() => requireOrgAdmin(orgAdmin)).not.toThrow();
  });
});
