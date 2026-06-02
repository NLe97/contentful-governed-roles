import { describe, it, expect } from "vitest";
import { pickSpaceGovernance } from "@/lib/governance/store";

const entries = [
  { fields: { spaceId: { "en-US": "s1" }, policyRef: { "en-US": "p1" }, inviterUserIds: { "en-US": ["u1"] } } },
  { fields: { spaceId: { "en-US": "s2" }, policyRef: { "en-US": "p2" }, inviterUserIds: { "en-US": [] } } },
];

describe("pickSpaceGovernance", () => {
  it("finds the entry whose spaceId matches", () => {
    const g = pickSpaceGovernance(entries as never, "s2");
    expect(g?.policyRef).toBe("p2");
  });
  it("returns null when no entry matches", () => {
    expect(pickSpaceGovernance(entries as never, "nope")).toBeNull();
  });
});
