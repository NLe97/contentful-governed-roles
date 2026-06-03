import { describe, it, expect } from "vitest";
import { decodeDenies, roleDeletable } from "@/lib/console/role-policy";

describe("decodeDenies", () => {
  it("maps deny policies back to deny rules (update->edit)", () => {
    const policies = [
      { effect: "allow", actions: "all" },
      { effect: "deny", actions: ["update"], constraint: { and: [{ equals: [{ doc: "sys.contentType.sys.id" }, "config"] }] } },
      { effect: "deny", actions: ["publish"], constraint: { and: [{ equals: [{ doc: "sys.contentType.sys.id" }, "post"] }] } },
    ];
    expect(decodeDenies(policies as never)).toEqual([
      { action: "edit", contentTypeId: "config" },
      { action: "publish", contentTypeId: "post" },
    ]);
  });
});

describe("roleDeletable", () => {
  it("is deletable when no member holds it", () => {
    expect(roleDeletable("r1", [{ roleIds: ["r2"] }])).toEqual({ deletable: true, holders: 0 });
  });
  it("is blocked when members still hold it", () => {
    expect(roleDeletable("r1", [{ roleIds: ["r1"] }, { roleIds: ["r1"] }])).toEqual({ deletable: false, holders: 2 });
  });
});
