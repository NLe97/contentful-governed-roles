import { describe, it, expect } from "vitest";
import { parseAccessConfig } from "@/lib/governance/store";

describe("parseAccessConfig", () => {
  it("reads admin/inviter lists from a spaceGovernance entry", () => {
    const entry = { fields: { spaceId: { "en-US": "s1" },
      adminUserIds: { "en-US": ["u-admin"] }, inviterUserIds: { "en-US": ["u-inv"] } } };
    const cfg = parseAccessConfig(entry as never);
    expect(cfg.adminUserIds).toEqual(["u-admin"]);
    expect(cfg.inviterUserIds).toEqual(["u-inv"]);
  });
  it("defaults to empty arrays when fields are missing", () => {
    const cfg = parseAccessConfig({ fields: { spaceId: { "en-US": "s1" } } } as never);
    expect(cfg.adminUserIds).toEqual([]);
    expect(cfg.inviterUserIds).toEqual([]);
  });
});
