export interface EnvVarStatus { name: string; present: boolean; required: boolean }
export interface HealthChecks { orgReachable: boolean; governanceModelReady: boolean }
export type HealthStatus = "ready" | "incomplete" | "error";
export interface HealthSummary { status: HealthStatus; problems: string[] }

export const REQUIRED_ENV = [
  "CF_SERVICE_TOKEN", "CF_ORG_ID", "CF_GOVERNANCE_SPACE_ID",
  "CF_PROTECTED_TEAM_ID", "CF_OAUTH_CLIENT_ID", "CF_OAUTH_REDIRECT_URI",
];
export const OPTIONAL_ENV = ["CF_GOVERNANCE_ENVIRONMENT_ID", "CF_WEBHOOK_SECRET", "CRON_SECRET"];

export function summarizeHealth(env: EnvVarStatus[], checks: HealthChecks): HealthSummary {
  const problems: string[] = [];
  for (const e of env) if (e.required && !e.present) problems.push(`Missing required environment variable: ${e.name}`);
  if (!checks.orgReachable) problems.push("Service token cannot reach the organization (check CF_SERVICE_TOKEN / CF_ORG_ID)");
  if (!checks.governanceModelReady) problems.push("Governance content model missing — run scripts/bootstrap.ts against the governance space");

  const missingRequired = env.some((e) => e.required && !e.present);
  let status: HealthStatus;
  if (!checks.orgReachable || !checks.governanceModelReady) status = "error";
  else if (missingRequired) status = "incomplete";
  else status = "ready";
  return { status, problems };
}
