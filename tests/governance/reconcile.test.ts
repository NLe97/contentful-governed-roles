import { describe, it, expect } from "vitest";
import { planReconcile } from "@/lib/governance/reconcile";

describe("planReconcile", () => {
  it("plans a role re-assert when role is missing and a re-add when protected member absent", () => {
    const plan = planReconcile({
      spaceId: "s1", governedRoleExists: false,
      protectedTeamPresent: false, protectedTeamId: "team-x",
    });
    expect(plan.reassertRole).toBe(true);
    expect(plan.reattachTeamId).toBe("team-x");
  });
  it("plans nothing when everything is healthy", () => {
    const plan = planReconcile({
      spaceId: "s1", governedRoleExists: true,
      protectedTeamPresent: true, protectedTeamId: "team-x",
    });
    expect(plan.reassertRole).toBe(false);
    expect(plan.reattachTeamId).toBeNull();
  });
});
