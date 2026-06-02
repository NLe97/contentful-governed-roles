import { describe, it, expect, vi } from "vitest";
import { removeMemberGuarded } from "@/lib/cma/memberships";

const ctx = { protectedTeamId: "team-x", orgAdminOwnerUserIds: ["u-protected-1"] };

describe("removeMemberGuarded", () => {
  it("refuses to remove a protected user and never calls the remover", async () => {
    const remover = vi.fn();
    await expect(removeMemberGuarded({ kind: "user", id: "u-protected-1" }, ctx, remover))
      .rejects.toThrow(/protected/i);
    expect(remover).not.toHaveBeenCalled();
  });

  it("removes an ordinary user via the remover", async () => {
    const remover = vi.fn().mockResolvedValue(undefined);
    await removeMemberGuarded({ kind: "user", id: "u-temp" }, ctx, remover);
    expect(remover).toHaveBeenCalledWith({ kind: "user", id: "u-temp" });
  });
});
