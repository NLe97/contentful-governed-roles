import { describe, it, expect } from "vitest";
import { buildAuthorizeUrl, parseIsOrgAdmin } from "@/lib/contentful/oauth";

describe("buildAuthorizeUrl", () => {
  it("includes client id, redirect, response_type=token and read scope", () => {
    const url = buildAuthorizeUrl({ clientId: "abc", redirectUri: "http://x/cb" });
    expect(url).toContain("client_id=abc");
    expect(url).toContain("redirect_uri=http%3A%2F%2Fx%2Fcb");
    expect(url).toContain("response_type=token");
  });
});

describe("parseIsOrgAdmin", () => {
  it("is true when this user's membership role is admin or owner", () => {
    const memberships = { items: [{ role: "owner", sys: { user: { sys: { id: "u1" } } } }] };
    expect(parseIsOrgAdmin(memberships as never, "u1")).toBe(true);
  });
  it("is false for a plain member", () => {
    const memberships = { items: [{ role: "member", sys: { user: { sys: { id: "u1" } } } }] };
    expect(parseIsOrgAdmin(memberships as never, "u1")).toBe(false);
  });
  it("is false when the admin membership belongs to a different user", () => {
    const memberships = { items: [{ role: "admin", sys: { user: { sys: { id: "other" } } } }] };
    expect(parseIsOrgAdmin(memberships as never, "u1")).toBe(false);
  });
});
