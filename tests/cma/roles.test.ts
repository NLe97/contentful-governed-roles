import { describe, it, expect } from "vitest";
import type { RoleDefinition } from "@/lib/policy/types";
import { roleNeedsUpdate } from "@/lib/cma/roles";

const desired: Pick<RoleDefinition, "name" | "permissions" | "policies"> = {
  name: "Standard", permissions: { ContentModel: "all" },
  policies: [{ effect: "allow", actions: "all" }],
};

describe("roleNeedsUpdate", () => {
  it("returns false when existing matches desired", () => {
    expect(roleNeedsUpdate(desired, { ...desired })).toBe(false);
  });
  it("returns true when policies differ", () => {
    expect(roleNeedsUpdate(desired, { ...desired, policies: [] })).toBe(true);
  });
  it("returns true when permissions differ", () => {
    expect(roleNeedsUpdate(desired, { ...desired, permissions: { ContentModel: [] } })).toBe(true);
  });
});
