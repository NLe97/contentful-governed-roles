import { describe, it, expect } from "vitest";
import { DenyPolicySchema } from "@/lib/policy/types";

describe("DenyPolicySchema", () => {
  it("accepts a valid policy with a JSON-field edit deny", () => {
    const parsed = DenyPolicySchema.parse({
      name: "Event Lockdown",
      denies: [{ action: "publish", contentTypeId: "landingPage" },
               { action: "edit", contentTypeId: "config", fields: ["payload"] }],
    });
    expect(parsed.denies).toHaveLength(2);
  });

  it("rejects an unknown action", () => {
    expect(() => DenyPolicySchema.parse({
      name: "x", denies: [{ action: "nuke", contentTypeId: "a" }],
    })).toThrow();
  });
});
