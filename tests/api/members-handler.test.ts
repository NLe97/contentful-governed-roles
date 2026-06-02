import { describe, it, expect, vi } from "vitest";
import { handleMemberAction } from "@/app/api/members/logic";

const gov = { spaceId: "s1", policyRef: "p1", inviterUserIds: ["u-inviter"], governedRoleId: "role-1" };

describe("handleMemberAction", () => {
  it("rejects a caller not on the allowlist", async () => {
    const res = await handleMemberAction(
      { identity: { userId: "u-x", isOrgAdmin: false }, gov, action: "add", email: "a@b.com",
        ctx: { protectedTeamId: "t", orgAdminOwnerUserIds: [] },
        deps: { addMember: vi.fn(), removeMembership: vi.fn(), listMembers: vi.fn(), appendAudit: vi.fn() } },
    );
    expect(res.status).toBe(403);
  });

  it("adds a member under the governed role and audits", async () => {
    const addMember = vi.fn().mockResolvedValue("m-9");
    const appendAudit = vi.fn();
    const res = await handleMemberAction(
      { identity: { userId: "u-inviter", isOrgAdmin: false }, gov, action: "add", email: "a@b.com",
        ctx: { protectedTeamId: "t", orgAdminOwnerUserIds: [] },
        deps: { addMember, removeMembership: vi.fn(), listMembers: vi.fn(), appendAudit } },
    );
    expect(res.status).toBe(200);
    expect(addMember).toHaveBeenCalledWith("s1", "a@b.com", "role-1");
    expect(appendAudit).toHaveBeenCalled();
  });
});
