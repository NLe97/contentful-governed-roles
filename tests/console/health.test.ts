import { describe, it, expect } from "vitest";
import { summarizeHealth, REQUIRED_ENV, type EnvVarStatus } from "@/lib/console/health";

const allPresent: EnvVarStatus[] = REQUIRED_ENV.map((name) => ({ name, present: true, required: true }));

describe("summarizeHealth", () => {
  it("is ready when all required env present and probes pass", () => {
    const r = summarizeHealth(allPresent, { orgReachable: true, governanceModelReady: true });
    expect(r.status).toBe("ready");
    expect(r.problems).toEqual([]);
  });
  it("is incomplete and names a missing required env (probes ok)", () => {
    const env = allPresent.map((e) => (e.name === "CF_OAUTH_CLIENT_ID" ? { ...e, present: false } : e));
    const r = summarizeHealth(env, { orgReachable: true, governanceModelReady: true });
    expect(r.status).toBe("incomplete");
    expect(r.problems.some((p) => p.includes("CF_OAUTH_CLIENT_ID"))).toBe(true);
  });
  it("is error when the org is unreachable", () => {
    const r = summarizeHealth(allPresent, { orgReachable: false, governanceModelReady: true });
    expect(r.status).toBe("error");
    expect(r.problems.some((p) => /reach the organization/i.test(p))).toBe(true);
  });
  it("is error when the governance content model is missing", () => {
    const r = summarizeHealth(allPresent, { orgReachable: true, governanceModelReady: false });
    expect(r.status).toBe("error");
    expect(r.problems.some((p) => /bootstrap/i.test(p))).toBe(true);
  });
});
