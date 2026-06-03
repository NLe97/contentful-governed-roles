import { describe, it, expect } from "vitest";
import { resolvePersona } from "@/lib/console/persona";

const spaces = [
  { spaceId: "s1", isAdmin: true, isInviter: true },
  { spaceId: "s2", isAdmin: false, isInviter: true },
  { spaceId: "s3", isAdmin: false, isInviter: false },
];

describe("resolvePersona", () => {
  it("org admin gets all spaces", () => {
    const r = resolvePersona({ userId: "u", isOrgAdmin: true }, spaces);
    expect(r.persona).toBe("orgAdmin");
    expect(r.adminSpaceIds).toEqual(["s1", "s2", "s3"]);
  });
  it("space admin gets only their admin spaces", () => {
    const r = resolvePersona({ userId: "u", isOrgAdmin: false }, spaces);
    expect(r.persona).toBe("spaceAdmin");
    expect(r.adminSpaceIds).toEqual(["s1"]);
    expect(r.inviterSpaceIds).toEqual(["s1", "s2"]);
  });
  it("inviter-only when no admin spaces", () => {
    const r = resolvePersona({ userId: "u", isOrgAdmin: false }, [{ spaceId: "s2", isAdmin: false, isInviter: true }]);
    expect(r.persona).toBe("inviter");
  });
  it("none when no access", () => {
    const r = resolvePersona({ userId: "u", isOrgAdmin: false }, [{ spaceId: "s3", isAdmin: false, isInviter: false }]);
    expect(r.persona).toBe("none");
  });
});
