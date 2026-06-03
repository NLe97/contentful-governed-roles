import { describe, it, expect } from "vitest";
import { canAccessSpace, canInvite, blocksSelfGovernanceLift, blocksOwnRoleEdit } from "@/lib/auth/space-access";

const cfg = { adminUserIds: ["u-admin"], inviterUserIds: ["u-inv"] };
const org = { userId: "u-o", isOrgAdmin: true };
const admin = { userId: "u-admin", isOrgAdmin: false };
const inviter = { userId: "u-inv", isOrgAdmin: false };
const stranger = { userId: "u-x", isOrgAdmin: false };

describe("canAccessSpace", () => {
  it("allows org admins", () => expect(canAccessSpace(org, cfg, false)).toBe(true));
  it("allows a built-in space admin even if not in the list", () => expect(canAccessSpace(stranger, cfg, true)).toBe(true));
  it("allows a listed space admin", () => expect(canAccessSpace(admin, cfg, false)).toBe(true));
  it("denies a stranger who is not a built-in admin", () => expect(canAccessSpace(stranger, cfg, false)).toBe(false));
  it("denies an inviter from full space access", () => expect(canAccessSpace(inviter, cfg, false)).toBe(false));
});

describe("canInvite", () => {
  it("allows an inviter", () => expect(canInvite(inviter, cfg, false)).toBe(true));
  it("allows anyone with space access", () => expect(canInvite(admin, cfg, false)).toBe(true));
  it("denies a stranger", () => expect(canInvite(stranger, cfg, false)).toBe(false));
});

describe("blocksSelfGovernanceLift", () => {
  it("blocks a non-privileged caller re-roling themselves", () => expect(blocksSelfGovernanceLift(false, "u1", "u1")).toBe(true));
  it("allows a non-privileged caller to re-role someone else", () => expect(blocksSelfGovernanceLift(false, "u1", "u2")).toBe(false));
  it("allows a privileged caller to re-role anyone incl. self", () => expect(blocksSelfGovernanceLift(true, "u1", "u1")).toBe(false));
});

describe("blocksOwnRoleEdit", () => {
  it("blocks a non-privileged caller editing a role they hold", () => expect(blocksOwnRoleEdit(false, ["r1"], "r1")).toBe(true));
  it("allows editing a role they don't hold", () => expect(blocksOwnRoleEdit(false, ["r2"], "r1")).toBe(false));
  it("allows a privileged caller to edit any role", () => expect(blocksOwnRoleEdit(true, ["r1"], "r1")).toBe(false));
});
