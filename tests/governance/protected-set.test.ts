import { describe, it, expect } from "vitest";
import { filterProtectedUserIds, type OrgMembershipItem } from "@/lib/governance/protected-set";

describe("filterProtectedUserIds", () => {
  it("returns admin and owner user IDs, excludes members", () => {
    const items: OrgMembershipItem[] = [
      { role: "owner", sys: { user: { sys: { id: "u1" } } } },
      { role: "member", sys: { user: { sys: { id: "u2" } } } },
      { role: "admin", sys: { user: { sys: { id: "u3" } } } },
    ];
    expect(filterProtectedUserIds(items)).toEqual(["u1", "u3"]);
  });

  it("returns empty array when no admin or owner exists", () => {
    const items: OrgMembershipItem[] = [
      { role: "member", sys: { user: { sys: { id: "u1" } } } },
      { role: "member", sys: { user: { sys: { id: "u2" } } } },
    ];
    expect(filterProtectedUserIds(items)).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(filterProtectedUserIds([])).toEqual([]);
  });

  it("returns all IDs when all are admin or owner", () => {
    const items: OrgMembershipItem[] = [
      { role: "owner", sys: { user: { sys: { id: "u1" } } } },
      { role: "admin", sys: { user: { sys: { id: "u2" } } } },
    ];
    expect(filterProtectedUserIds(items)).toEqual(["u1", "u2"]);
  });
});
