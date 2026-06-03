import { NextRequest, NextResponse } from "next/server";
import { authorizeOrgAdmin } from "@/lib/auth/require-request";
import { REQUIRED_ENV, OPTIONAL_ENV, summarizeHealth, type EnvVarStatus } from "@/lib/console/health";
import { cfGet } from "@/lib/cma/rest";

export async function GET(req: NextRequest) {
  const auth = await authorizeOrgAdmin(req); if ("error" in auth) return auth.error;

  const env: EnvVarStatus[] = [
    ...REQUIRED_ENV.map((name) => ({ name, present: Boolean(process.env[name]), required: true })),
    ...OPTIONAL_ENV.map((name) => ({ name, present: Boolean(process.env[name]), required: false })),
  ];

  let orgReachable = false;
  try { await cfGet(`/organizations/${process.env.CF_ORG_ID}`); orgReachable = true; } catch { /* stays false */ }

  let governanceModelReady = false;
  try {
    const envId = process.env.CF_GOVERNANCE_ENVIRONMENT_ID ?? "master";
    const ct = await cfGet<{ items: { sys: { id: string } }[] }>(`/spaces/${process.env.CF_GOVERNANCE_SPACE_ID}/environments/${envId}/content_types?limit=200`);
    const ids = new Set(ct.items.map((c) => c.sys.id));
    governanceModelReady = ["denyPolicy", "spaceGovernance", "auditEvent"].every((id) => ids.has(id));
  } catch { /* stays false */ }

  const summary = summarizeHealth(env, { orgReachable, governanceModelReady });
  return NextResponse.json({ env, orgReachable, governanceModelReady, ...summary });
}
