// Creates a governed role with an edit-deny on a content type, assigns it to a throwaway
// user, and prints the role so we can confirm in-UI that the denied op is blocked.
import { cma } from "../lib/cma/client.ts";
import { computeGovernedRole } from "../lib/policy/compute-governed-role.ts";

const spaceId = process.env.PROBE_SPACE_ID!;
const ctId = process.env.PROBE_CONTENT_TYPE_ID ?? "config";
const def = computeGovernedRole({ name: "PROBE Governed", denies: [{ action: "edit", contentTypeId: ctId }] });
const space = await cma().getSpace(spaceId);
const role = await space.createRole({ name: def.name, permissions: def.permissions, policies: def.policies } as never);
console.log("Created role", role.sys.id, "— assign a test user in the UI and confirm they cannot edit", ctId);
