import { cma, withRetry } from "@/lib/cma/client";

export interface OrgMembershipItem {
  role: string;
  sys: { user: { sys: { id: string } } };
}

export function filterProtectedUserIds(items: OrgMembershipItem[]): string[] {
  return items
    .filter((m) => m.role === "admin" || m.role === "owner")
    .map((m) => m.sys.user.sys.id);
}

export async function getProtectedUserIds(orgId: string): Promise<string[]> {
  const org = await withRetry(() => cma().getOrganization(orgId));
  const res = await withRetry(() =>
    (org as unknown as { getOrganizationMemberships: (opts: { limit: number }) => Promise<{ items: unknown[] }> })
      .getOrganizationMemberships({ limit: 1000 })
  );
  return filterProtectedUserIds(res.items as unknown as OrgMembershipItem[]);
}
