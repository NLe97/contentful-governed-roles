import { describe, it, expect, vi } from "vitest";
import { assignMemberRoleGuarded } from "@/lib/console/operations";

const ctx = { protectedTeamId: "t", orgAdminOwnerUserIds: ["u-owner"] };

describe("assignMemberRoleGuarded", () => {
  it("refuses to re-role a protected org admin/owner", async () => {
    const apply = vi.fn();
    await expect(assignMemberRoleGuarded("u-owner", ctx, apply)).rejects.toThrow(/protected/i);
    expect(apply).not.toHaveBeenCalled();
  });
  it("applies for an ordinary member", async () => {
    const apply = vi.fn().mockResolvedValue(undefined);
    await assignMemberRoleGuarded("u-x", ctx, apply);
    expect(apply).toHaveBeenCalled();
  });
});
