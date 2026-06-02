export function buildAuthorizeUrl(opts: { clientId: string; redirectUri: string }): string {
  const p = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "token",
    scope: "content_management_read content_management_manage",
  });
  return `https://be.contentful.com/oauth/authorize?${p.toString()}`;
}

// The org-scoped memberships endpoint returns one membership per user in that org
// (no `organization` link on the item). So org-admin = the membership for THIS user
// has role admin or owner.
interface OrgMemberships { items: { role: string; sys: { user: { sys: { id: string } } } }[] }
export function parseIsOrgAdmin(memberships: OrgMemberships, userId: string): boolean {
  return memberships.items.some(
    (m) => m.sys.user.sys.id === userId && (m.role === "admin" || m.role === "owner"),
  );
}

export async function resolveIdentity(userToken: string, orgId: string): Promise<{ userId: string; isOrgAdmin: boolean }> {
  const meRes = await fetch("https://api.contentful.com/users/me", {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  if (!meRes.ok) throw new Error(`identity lookup failed: ${meRes.status}`);
  const me = await meRes.json();
  const membershipsRes = await fetch(`https://api.contentful.com/organizations/${orgId}/organization_memberships?limit=100`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  if (!membershipsRes.ok) throw new Error(`identity lookup failed: ${membershipsRes.status}`);
  const memberships = await membershipsRes.json();
  return { userId: me.sys.id, isOrgAdmin: parseIsOrgAdmin(memberships, me.sys.id) };
}
