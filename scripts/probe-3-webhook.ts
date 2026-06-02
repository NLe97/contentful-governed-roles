// Registers a SpaceMembership.delete + TeamSpaceMembership.delete webhook on the probe space
// pointing at the local tunnel, so detect-and-revert can be observed.
import { cma } from "../lib/cma/client.ts";
const orgId = process.env.CF_ORG_ID!;
const url = process.env.PROBE_WEBHOOK_URL!;
const org = await cma().getOrganization(orgId);
const wh = await (org as never as { createWebhook: Function }).createWebhook?.({
  name: "probe-membership-delete", url,
  topics: ["SpaceMembership.delete", "TeamSpaceMembership.delete"],
}) ?? console.log("Org-level webhook unsupported — register per space instead (spec O5 fallback)");
console.log("Webhook:", wh?.sys?.id ?? "see message above");
