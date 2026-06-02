import { cma } from "../lib/cma/client.ts";
const spaceId = process.env.PROBE_SPACE_ID!;
const email = process.env.PROBE_EMAIL!;
const roleId = process.env.PROBE_ROLE_ID!;
const space = await cma().getSpace(spaceId);
const m = await space.createSpaceMembership({ admin: false, email, roles: [{ sys: { type: "Link", linkType: "Role", id: roleId } }] } as never);
console.log("Added membership", m.sys.id, "via service token (no admin role needed by caller)");
