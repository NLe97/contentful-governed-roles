import type { DenyAction, DenyPolicy, RoleDefinition, RolePolicy } from "./types";

const ACTION_MAP: Record<DenyAction, string> = {
  edit: "update",
  publish: "publish",
  create: "create",
  delete: "delete",
};

const SPACE_ADMIN_EQUIVALENT_PERMISSIONS: RoleDefinition["permissions"] = {
  ContentModel: "all",
  Settings: "all",
  ContentDelivery: "all",
  Environments: "all",
  EnvironmentAliases: "all",
  Tags: "all",
};

function baseAllow(docType: "Entry" | "Asset"): RolePolicy {
  return { effect: "allow", actions: "all", constraint: { and: [{ equals: [{ doc: "sys.type" }, docType] }] } };
}

function denyToPolicy(action: DenyAction, contentTypeId: string, fields?: string[]): RolePolicy {
  const and: unknown[] = [{ equals: [{ doc: "sys.contentType.sys.id" }, contentTypeId] }];
  if (fields && fields.length > 0) {
    and.push({ paths: fields.map((f) => ({ doc: `fields.${f}.%` })) });
  }
  return { effect: "deny", actions: [ACTION_MAP[action]], constraint: { and } };
}

export function computeGovernedRole(policy: DenyPolicy): RoleDefinition {
  return {
    name: policy.name,
    description: policy.description,
    permissions: SPACE_ADMIN_EQUIVALENT_PERMISSIONS,
    policies: [
      baseAllow("Entry"),
      baseAllow("Asset"),
      ...policy.denies.map((d) => denyToPolicy(d.action, d.contentTypeId, d.fields)),
    ],
  };
}
