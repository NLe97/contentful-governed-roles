import type { DenyPolicy } from "@/lib/policy/types";

type Action = DenyPolicy["denies"][number]["action"];
const REVERSE: Record<string, Action> = { update: "edit", publish: "publish", create: "create", delete: "delete" };

interface RolePolicyLike { effect: string; actions: string | string[]; constraint?: unknown }

export function decodeDenies(policies: RolePolicyLike[]): DenyPolicy["denies"] {
  return policies
    .filter((p) => p.effect === "deny")
    .map((p) => {
      const action = Array.isArray(p.actions) ? p.actions[0] : p.actions;
      return { action: REVERSE[action ?? ""] ?? "edit", contentTypeId: extractContentTypeId(p.constraint) };
    });
}

function extractContentTypeId(constraint: unknown): string {
  try { return (constraint as any).and[0].equals[1]; } catch { return "(unknown)"; }
}

export function roleDeletable(roleId: string, members: { roleIds: string[] }[]): { deletable: boolean; holders: number } {
  const holders = members.filter((m) => m.roleIds.includes(roleId)).length;
  return { deletable: holders === 0, holders };
}
