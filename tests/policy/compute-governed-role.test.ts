import { describe, it, expect } from "vitest";
import { computeGovernedRole } from "@/lib/policy/compute-governed-role";

describe("computeGovernedRole", () => {
  const base = { name: "Standard", denies: [] };

  it("grants the Space-Admin-equivalent permission set", () => {
    const role = computeGovernedRole(base);
    expect(role.permissions.ContentModel).toBe("all");
    expect(role.permissions.Settings).toBe("all");
    expect(role.permissions.ContentDelivery).toBe("all");
  });

  it("includes a base allow-all entry/asset policy", () => {
    const role = computeGovernedRole(base);
    expect(role.policies[0]).toEqual({ effect: "allow", actions: "all", constraint: { and: [{ equals: [{ doc: "sys.type" }, "Entry"] }] } });
  });

  it("appends a deny policy per rule, mapping edit->update and scoping by content type", () => {
    const role = computeGovernedRole({
      name: "Lockdown", denies: [{ action: "edit", contentTypeId: "config" }],
    });
    const deny = role.policies.find((p) => p.effect === "deny");
    expect(deny).toBeDefined();
    expect(deny!.actions).toEqual(["update"]);
    expect(deny!.constraint).toEqual({
      and: [{ equals: [{ doc: "sys.contentType.sys.id" }, "config"] }],
    });
  });

  it("scopes a field-level deny by paths when fields are given", () => {
    const role = computeGovernedRole({
      name: "f", denies: [{ action: "edit", contentTypeId: "config", fields: ["payload"] }],
    });
    const deny = role.policies.find((p) => p.effect === "deny")!;
    expect(deny.constraint).toEqual({
      and: [
        { equals: [{ doc: "sys.contentType.sys.id" }, "config"] },
        { paths: [{ doc: "fields.payload.%" }] },
      ],
    });
  });
});
